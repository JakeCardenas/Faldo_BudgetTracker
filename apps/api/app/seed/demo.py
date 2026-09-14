import asyncio
import os
import random
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select

from app.ai.rag.documents import render
from app.ai.rag.indexer import index_monthly_summary, upsert_documents
from app.core.db import dispose_engine, get_sessionmaker, scoped_session, set_user_scope
from app.core.security import hash_password
from app.engine.periods import add_months, month_end, month_key, month_start, today_in
from app.engine.planning import advance_due_date
from app.models import (
    Account,
    Budget,
    BudgetCategory,
    Category,
    Debt,
    DebtPayment,
    FinancialNote,
    GoalContribution,
    Merchant,
    RecurringPayment,
    SavingsGoal,
    Tag,
    Transaction,
    TransactionItem,
    User,
    UserSettings,
)
from app.models.enums import (
    AccountType,
    DebtDirection,
    DebtStatus,
    Frequency,
    RecurringKind,
    TransactionSource,
    TransactionType,
)
from app.services.categories import create_default_categories
from app.services.common import normalize_name

DEMO_EMAIL = "jake@faldo.app"
TIMEZONE = "Asia/Manila"
HISTORY_MONTHS = 6
P = 100


@dataclass
class Ledger:
    user_id: uuid.UUID
    accounts: dict[str, Account]
    categories: dict[tuple[str, str | None], Category]
    balances: dict[str, int] = field(default_factory=dict)
    merchants: dict[str, Merchant] = field(default_factory=dict)
    tags: dict[str, Tag] = field(default_factory=dict)
    transactions: list[Transaction] = field(default_factory=list)

    def category(self, name: str, sub: str | None = None) -> tuple[uuid.UUID, uuid.UUID | None]:
        parent = self.categories[(name, None)]
        child = self.categories.get((sub, parent.name)) if sub else None
        return parent.id, child.id if child else None


def php(value: float | int) -> int:
    return int(Decimal(str(value)) * P)


async def _merchant(db, ledger: Ledger, name: str, category_id: uuid.UUID | None) -> Merchant:
    key = normalize_name(name)
    if key not in ledger.merchants:
        m = Merchant(user_id=ledger.user_id, name=name, normalized_name=key, default_category_id=category_id)
        db.add(m)
        await db.flush()
        ledger.merchants[key] = m
    return ledger.merchants[key]


def _apply(ledger: Ledger, txn_type: TransactionType, amount: int, account: str, to_account: str | None = None) -> None:
    if txn_type == TransactionType.income:
        ledger.balances[account] += amount
    elif txn_type == TransactionType.expense:
        ledger.balances[account] -= amount
    else:
        ledger.balances[account] -= amount
        assert to_account
        ledger.balances[to_account] += amount


TOP_UPS = {"gcash": ("GCash cash-in", 5_000), "maya": ("Maya top-up", 1_500), "cash": ("ATM withdrawal", 3_000)}


async def add_txn(
    db, ledger: Ledger, *, on: date, txn_type: TransactionType, amount: int, account: str, to_account: str | None = None,
    merchant: str | None = None, category: tuple[str, str | None] | None = None, notes: str | None = None,
    items: list[tuple[str, int]] | None = None, tags: list[str] | None = None, payment_method: str | None = None,
    recurring: RecurringPayment | None = None,
) -> Transaction:
    if txn_type == TransactionType.expense and account in TOP_UPS and ledger.balances[account] - amount < 300 * P:
        label, top_up = TOP_UPS[account]
        needed = max(php(top_up), amount + 300 * P - ledger.balances[account])
        needed = ((needed + 99_999) // 100_000) * 100_000
        await add_txn(db, ledger, on=on, txn_type=TransactionType.transfer, amount=needed, account="bpi", to_account=account,
                      notes=label)
    cat_id = sub_id = None
    if category:
        cat_id, sub_id = ledger.category(*category)
    merchant_obj = await _merchant(db, ledger, merchant, cat_id if txn_type == TransactionType.expense else None) if merchant else None
    txn = Transaction(
        user_id=ledger.user_id, type=txn_type, amount_minor=amount, currency="PHP", occurred_on=on,
        account_id=ledger.accounts[account].id, to_account_id=ledger.accounts[to_account].id if to_account else None,
        merchant_id=merchant_obj.id if merchant_obj else None, category_id=cat_id, subcategory_id=sub_id,
        payment_method=payment_method, notes=notes,
        source=TransactionSource.recurring if recurring else TransactionSource.seed,
        recurring_payment_id=recurring.id if recurring else None,
    )
    if items:
        txn.items = [TransactionItem(user_id=ledger.user_id, name=name, quantity=Decimal(1), unit_amount_minor=value,
                                     amount_minor=value, position=i) for i, (name, value) in enumerate(items)]
    if tags:
        tag_objs = []
        for t in tags:
            if t not in ledger.tags:
                ledger.tags[t] = Tag(user_id=ledger.user_id, name=t)
                db.add(ledger.tags[t])
            tag_objs.append(ledger.tags[t])
        txn.tags = tag_objs
    db.add(txn)
    ledger.transactions.append(txn)
    _apply(ledger, txn_type, amount, account, to_account)
    return txn


def _split(rng: random.Random, total: int, names: list[str]) -> list[tuple[str, int]]:
    if len(names) == 1:
        return [(names[0], total)]
    weights = [rng.uniform(0.6, 1.4) for _ in names]
    parts = [int(total * w / sum(weights) / 100) * 100 for w in weights]
    parts[-1] = total - sum(parts[:-1])
    return list(zip(names, parts, strict=True))


FAST_FOOD = [("Jollibee", 165, 420), ("McDonald's", 150, 380), ("Chowking", 180, 360), ("Mang Inasal", 170, 320)]
SHOPEE_ORDERS = [
    ["Phone case", "Screen protector"], ["Desk lamp"], ["Water bottle", "Lunch box"], ["Face wash", "Sunscreen"],
    ["USB-C cable", "Wall charger"], ["Notebook set", "Gel pens"], ["Bedsheet set"], ["Bluetooth mouse"],
]
GROCERS = ["SM Supermarket", "Puregold"]


async def seed(reset: bool = True) -> None:
    password = os.environ.get("SEED_DEMO_PASSWORD", "faldo-demo-2026")
    today = today_in(TIMEZONE)
    start = add_months(month_start(today), -HISTORY_MONTHS) + timedelta(days=14)
    rng = random.Random(20260914)

    async with get_sessionmaker()() as anon, anon.begin():
        await set_user_scope(anon, None)
        existing = (await anon.execute(select(User).where(User.email == DEMO_EMAIL))).scalar_one_or_none()
        if existing and not reset:
            print("Demo user already exists.")
            return
        if existing:
            await set_user_scope(anon, existing.id)
            await anon.execute(delete(User).where(User.id == existing.id))
        user = User(email=DEMO_EMAIL, password_hash=hash_password(password), display_name="Jake")
        anon.add(user)
        await anon.flush()
        user_id = user.id

    async with scoped_session(user_id) as db:
        settings = UserSettings(user_id=user_id, currency="PHP", timezone=TIMEZONE, pay_frequency=Frequency.semi_monthly,
                                pay_days=[15, 30], monthly_income_minor=php(48_000), safe_to_spend_buffer_minor=php(2_000),
                                onboarding_completed_at=datetime.now(UTC))
        db.add(settings)
        await create_default_categories(db, user_id)
        categories = (await db.execute(select(Category).where(Category.user_id == user_id))).scalars().all()
        by_id = {c.id: c for c in categories}
        cat_map = {(c.name, by_id[c.parent_id].name if c.parent_id else None): c for c in categories}

        specs = [
            ("bpi", "BPI Payroll", AccountType.bank, "BPI", php(18_400), True, None, "#B91C1C"),
            ("gcash", "GCash", AccountType.e_wallet, "GCash", php(2_350), True, None, "#1D4ED8"),
            ("maya", "Maya", AccountType.e_wallet, "Maya", php(1_180), True, None, "#047857"),
            ("cash", "Cash", AccountType.cash, None, php(1_500), True, None, "#57534E"),
            ("card", "BPI Rewards Card", AccountType.credit_card, "BPI", -php(3_240), False, php(60_000), "#7C3AED"),
            ("savings", "GoTyme Savings", AccountType.savings, "GoTyme Bank", php(20_000), False, None, "#0E7490"),
        ]
        accounts: dict[str, Account] = {}
        for key, name, acc_type, inst, opening, spendable, limit, color in specs:
            accounts[key] = Account(user_id=user_id, name=name, type=acc_type, institution=inst, currency="PHP",
                                    opening_balance_minor=opening, is_spendable=spendable, credit_limit_minor=limit, color=color)
            db.add(accounts[key])
        await db.flush()
        settings.default_account_id = accounts["gcash"].id

        ledger = Ledger(user_id=user_id, accounts=accounts, categories=cat_map,
                        balances={k: a.opening_balance_minor for k, a in accounts.items()})

        series_meta: dict[int, tuple[int, tuple[str, str | None], str, str]] = {}

        def series(name: str, kind: RecurringKind, amount: float, freq: Frequency, day: int, account: str,
                   category: tuple[str, str | None], merchant: str | None = None, variable: bool = False) -> RecurringPayment:
            cat_id, _ = ledger.category(*category)
            r = RecurringPayment(user_id=user_id, name=name, kind=kind, amount_minor=php(amount), currency="PHP",
                                 is_amount_variable=variable, frequency=freq, interval_count=1,
                                 next_due_on=today, account_id=accounts[account].id, category_id=cat_id)
            db.add(r)
            series_meta[id(r)] = (day, category, merchant or name, account)
            return r

        rent = series("Condo rent", RecurringKind.rent, 9_000, Frequency.monthly, 5, "bpi", ("Housing", "Rent"), "Unit 12B Rent")
        meralco = series("Meralco", RecurringKind.bill, 2_300, Frequency.monthly, 20, "gcash", ("Bills & Utilities", "Electricity"), variable=True)
        pldt = series("PLDT Fiber", RecurringKind.bill, 1_699, Frequency.monthly, 12, "bpi", ("Bills & Utilities", "Internet"), "PLDT")
        water = series("Maynilad", RecurringKind.bill, 420, Frequency.monthly, 22, "gcash", ("Bills & Utilities", "Water"), variable=True)
        globe = series("Globe Plan 599", RecurringKind.bill, 599, Frequency.monthly, 8, "gcash", ("Bills & Utilities", "Mobile load"), "Globe")
        netflix = series("Netflix", RecurringKind.subscription, 549, Frequency.monthly, 18, "card", ("Subscriptions", None))
        spotify = series("Spotify Premium", RecurringKind.subscription, 149, Frequency.monthly, 3, "card", ("Subscriptions", None), "Spotify")
        icloud = series("iCloud+ 200GB", RecurringKind.subscription, 149, Frequency.monthly, 10, "card", ("Subscriptions", None), "Apple")
        gym = series("Anytime Fitness", RecurringKind.subscription, 1_800, Frequency.monthly, 1, "bpi", ("Health", None))
        salary_a = RecurringPayment(user_id=user_id, name="Salary (15th)", kind=RecurringKind.income, amount_minor=php(24_000),
                                    frequency=Frequency.monthly, next_due_on=today, account_id=accounts["bpi"].id,
                                    category_id=ledger.category("Salary")[0])
        salary_b = RecurringPayment(user_id=user_id, name="Salary (end of month)", kind=RecurringKind.income, amount_minor=php(24_000),
                                    frequency=Frequency.monthly, next_due_on=today, account_id=accounts["bpi"].id,
                                    category_id=ledger.category("Salary")[0])
        db.add_all([salary_a, salary_b])
        await db.flush()
        bills = [rent, meralco, pldt, water, globe, netflix, spotify, icloud, gym]

        macbook = SavingsGoal(user_id=user_id, name="MacBook Air", emoji="💻", target_minor=php(75_000), currency="PHP",
                              target_date=date(today.year + 1, 3, 31), monthly_contribution_minor=php(6_000),
                              notes="For freelance design work.")
        emergency = SavingsGoal(user_id=user_id, name="Emergency fund", emoji="🛟", target_minor=php(120_000), currency="PHP",
                                target_date=date(today.year + 2, 6, 30), monthly_contribution_minor=php(3_000),
                                linked_account_id=accounts["savings"].id)
        japan = SavingsGoal(user_id=user_id, name="Japan trip", emoji="✈️", target_minor=php(60_000), currency="PHP",
                            target_date=date(today.year + 1, 4, 15), monthly_contribution_minor=php(4_000))
        db.add_all([macbook, emergency, japan])
        await db.flush()
        db.add(GoalContribution(user_id=user_id, goal_id=macbook.id, amount_minor=php(5_000), occurred_on=start,
                                note="Starting amount"))

        one_offs: dict[date, list[dict]] = {}

        def one_off(offset_months: int, dom: int, **kwargs) -> None:
            when = add_months(month_start(today), offset_months).replace(day=dom)
            if start <= when <= today:
                one_offs.setdefault(when, []).append(kwargs)

        one_off(-4, 18, txn_type=TransactionType.expense, amount=php(5_200), account="card", merchant="Shopee",
                      category=("Shopping", "Shoes"), items=[("Adidas Samba OG sneakers", php(5_200))], notes="Birthday treat")
        one_off(-3, 20, txn_type=TransactionType.expense, amount=php(1_850), account="gcash", merchant="Victory Liner",
                      category=("Travel", None), notes="Bus to Baguio, round trip", tags=["baguio trip"])
        one_off(-3, 21, txn_type=TransactionType.expense, amount=php(3_600), account="bpi", merchant="Hotel Elizabeth Baguio",
                      category=("Travel", None), notes="Two nights, Baguio trip", tags=["baguio trip"])
        one_off(-3, 22, txn_type=TransactionType.expense, amount=php(1_240), account="cash", merchant="Good Taste Restaurant",
                      category=("Food & Dining", "Restaurants"), tags=["baguio trip"])
        one_off(-2, 11, txn_type=TransactionType.expense, amount=php(2_500), account="gcash", merchant="Red Ribbon",
                      category=("Gifts & Family", None), items=[("Chocolate mousse cake", php(1_150)), ("Flowers", php(1_350))],
                      notes="Mom's birthday")
        one_off(-2, 20, txn_type=TransactionType.expense, amount=php(1_990), account="card", merchant="Uniqlo",
                      category=("Shopping", "Clothing"), items=[("AIRism shirt", php(790)), ("Chino shorts", php(1_200))])
        one_off(-1, 6, txn_type=TransactionType.income, amount=php(8_500), account="gcash", merchant="Freelance client",
                      category=("Freelance", None), notes="Logo design project")
        one_off(-1, 19, txn_type=TransactionType.expense, amount=php(3_500), account="gcash", merchant="Ticketnet",
                      category=("Entertainment", "Events"), notes="Concert ticket, Paolo paid for half")
        one_off(-1, 23, txn_type=TransactionType.expense, amount=php(1_200), account="card", merchant="Foot Locker",
                      category=("Shopping", "Shoes"), items=[("Running socks 3-pack", php(450)), ("Shoe cleaner kit", php(750))])
        one_off(0, 6, txn_type=TransactionType.expense, amount=php(6_000), account="card", merchant="Nike Store",
                      category=("Shopping", "Shoes"),
                      items=[("Nike Air Force 1 shoes", php(4_500)), ("Nike socks", php(800)), ("Nike Dri-FIT shirt", php(700))])
        one_off(0, 10, txn_type=TransactionType.expense, amount=php(1_450), account="bpi", merchant="Sunlife",
                      category=("Fees & Charges", None), notes="Annual account fee")
        card_owed_at_month_end: dict[str, int] = {}
        day = start
        while day <= today:
            dom, wd = day.day, day.weekday()
            last_day = month_end(day).day

            if dom == 15 or dom == last_day:
                await add_txn(db, ledger, on=day, txn_type=TransactionType.income, amount=php(24_000), account="bpi",
                              merchant="Northwind Creative", category=("Salary", None),
                              recurring=salary_a if dom == 15 else salary_b)

            for bill in bills:
                bill_day, bill_category, bill_merchant, bill_account = series_meta[id(bill)]
                if bill_day == dom:
                    amount = bill.amount_minor
                    if bill.is_amount_variable:
                        amount = php(round(bill.amount_minor / P * rng.uniform(0.85, 1.18), -1))
                    await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=amount, account=bill_account,
                                  merchant=bill_merchant, category=bill_category, recurring=bill)

            if dom == 16:
                await add_txn(db, ledger, on=day, txn_type=TransactionType.transfer, amount=php(3_000), account="bpi",
                              to_account="savings", notes="Monthly emergency fund transfer")
                if day > start:
                    db.add(GoalContribution(user_id=user_id, goal_id=macbook.id, amount_minor=php(6_000), occurred_on=day,
                                            note="Monthly set-aside"))
                    if day >= add_months(month_start(today), -2) and day < month_start(today):
                        db.add(GoalContribution(user_id=user_id, goal_id=japan.id, amount_minor=php(4_000), occurred_on=day,
                                                note="Japan fund"))

            if dom == 25:
                prev_key = month_key(add_months(month_start(day), -1))
                owed = card_owed_at_month_end.get(prev_key, php(3_240) if prev_key < month_key(start) else 0)
                if owed > 0:
                    await add_txn(db, ledger, on=day, txn_type=TransactionType.transfer, amount=owed, account="bpi",
                                  to_account="card", notes="Credit card payment")

            if wd < 5 and rng.random() < 0.62:
                name, lo, hi = rng.choice(FAST_FOOD)
                acct = rng.choice(["gcash", "gcash", "cash"])
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=php(rng.randrange(lo, hi, 5)),
                              account=acct, merchant=name, category=("Food & Dining", "Fast food"),
                              payment_method="QR Ph" if acct == "gcash" else None)
            if rng.random() < 0.28:
                items = rng.choice([["Iced Caramel Macchiato"], ["Caffè Americano", "Banana loaf"], ["Cold Brew"], ["Java Chip Frappuccino"]])
                amount = php(rng.randrange(165, 320, 5))
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=amount,
                              account=rng.choice(["maya", "gcash"]), merchant="Starbucks", category=("Food & Dining", "Coffee"),
                              items=_split(rng, amount, items))
            if wd in (4, 5) and rng.random() < 0.55:
                amount = php(rng.randrange(290, 720, 10))
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=amount, account="gcash",
                              merchant="GrabFood", category=("Food & Dining", "Food delivery"))
            if wd < 5 and rng.random() < 0.38:
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=php(rng.randrange(150, 390, 5)),
                              account="gcash", merchant="Grab", category=("Transportation", "Ride-hailing"))
            if wd == 0:
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=php(rng.choice([280, 300, 320, 350])),
                              account="cash", merchant="MRT / Jeepney", category=("Transportation", "Public transit"),
                              notes="Weekly commute")
            if wd == 6 or (wd == 5 and rng.random() < 0.3):
                amount = php(rng.randrange(1_150, 2_600, 10))
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=amount,
                              account=rng.choice(["card", "bpi"]), merchant=rng.choice(GROCERS), category=("Groceries", None),
                              items=_split(rng, amount, ["Rice 5kg", "Eggs", "Chicken", "Vegetables", "Coffee", "Toiletries"][: rng.randint(3, 6)]))
            if rng.random() < 0.075:
                amount = php(rng.randrange(390, 2_400, 10))
                order = rng.choice(SHOPEE_ORDERS)
                store = rng.choice(["Shopee", "Lazada"])
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=amount, account="card",
                              merchant=store, category=("Shopping", "Home goods" if "Bedsheet" in order[0] or "lamp" in order[0] else "Electronics"
                                                        if any(w in order[0] for w in ("USB", "Phone", "mouse")) else None),
                              items=_split(rng, amount, order))
            if dom == 9 and rng.random() < 0.9:
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=php(rng.choice([520, 580, 640])),
                              account="maya", merchant="Ayala Malls Cinemas", category=("Entertainment", "Movies"))
            if dom == 27:
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=php(rng.randrange(260, 980, 10)),
                              account="gcash", merchant="Mercury Drug", category=("Health", "Pharmacy"),
                              items=[("Vitamins", php(250))] if rng.random() < 0.5 else None)
            if dom == 13:
                await add_txn(db, ledger, on=day, txn_type=TransactionType.expense, amount=php(250), account="cash",
                              merchant="Bruno's Barbers", category=("Personal Care", None))
            for kwargs in one_offs.get(day, []):
                await add_txn(db, ledger, on=day, **kwargs)
            if dom == last_day:
                card_owed_at_month_end[month_key(day)] = -ledger.balances["card"]
            day += timedelta(days=1)

        await db.flush()

        for bill in [*bills, salary_a, salary_b]:
            meta = series_meta.get(id(bill))
            day_of = meta[0] if meta else (15 if bill is salary_a else 30)
            candidate = today.replace(day=min(day_of, month_end(today).day))
            if candidate <= today:
                candidate = advance_due_date(candidate, "monthly")
                candidate = candidate.replace(day=min(day_of, month_end(candidate).day))
            bill.next_due_on = candidate
            bill.anchor_day = day_of
            merchant_name = meta[2] if meta else None
            if merchant_name:
                bill.merchant_id = ledger.merchants[normalize_name(merchant_name)].id

        budget_lines = {"Food & Dining": 9_000, "Groceries": 7_500, "Transportation": 4_500, "Shopping": 4_000,
                        "Entertainment": 1_500, "Bills & Utilities": 5_500, "Subscriptions": 900, "Housing": 9_000,
                        "Health": 2_800}
        for offset in range(-3, 1):
            month = add_months(month_start(today), offset)
            budget = Budget(user_id=user_id, month=month)
            budget.lines = [BudgetCategory(user_id=user_id, category_id=ledger.category(n)[0], limit_minor=php(v))
                            for n, v in budget_lines.items()]
            db.add(budget)

        paolo = Debt(user_id=user_id, direction=DebtDirection.i_owe, counterparty="Paolo", amount_minor=php(1_750),
                     currency="PHP", due_on=month_end(today), started_on=add_months(month_start(today), -1).replace(day=19),
                     notes="Half of the concert ticket he covered")
        mika = Debt(user_id=user_id, direction=DebtDirection.owed_to_me, counterparty="Mika", amount_minor=php(1_500),
                    currency="PHP", due_on=today + timedelta(days=6), started_on=today - timedelta(days=10), notes="Dinner split")
        mika.payments = [DebtPayment(user_id=user_id, amount_minor=php(500), paid_on=today - timedelta(days=4))]
        carlo = Debt(user_id=user_id, direction=DebtDirection.owed_to_me, counterparty="Carlo (brother)", amount_minor=php(3_000),
                     currency="PHP", due_on=add_months(month_end(today), 1), started_on=add_months(month_start(today), -1).replace(day=20),
                     notes="Tuition help, he'll pay back after his first paycheck")
        settled = Debt(user_id=user_id, direction=DebtDirection.i_owe, counterparty="Ria", amount_minor=php(800), currency="PHP",
                       due_on=add_months(month_start(today), -2).replace(day=28), started_on=add_months(month_start(today), -2).replace(day=14),
                       status=DebtStatus.settled, notes="Grab rides during the office outing")
        settled.payments = [DebtPayment(user_id=user_id, amount_minor=php(800), paid_on=add_months(month_start(today), -2).replace(day=26))]
        db.add_all([paolo, mika, carlo, settled])

        db.add_all([
            FinancialNote(user_id=user_id, content="Lent Carlo ₱3,000 for his tuition. That's why cash felt tight last month."),
            FinancialNote(user_id=user_id, content="The Baguio trip was a one-time expense. I don't plan another trip until Japan.",
                          related_goal_id=japan.id),
            FinancialNote(user_id=user_id, content="Want to buy the MacBook Air before March for freelance design work.",
                          related_goal_id=macbook.id),
            FinancialNote(user_id=user_id, content="Trying to cut down on GrabFood deliveries on weekends."),
        ])
        await db.flush()

        print("Closing balances:", {k: v / P for k, v in ledger.balances.items()})
        for key, balance in ledger.balances.items():
            if key in {"gcash", "maya", "cash", "bpi", "savings"} and balance < 0:
                raise RuntimeError(f"Seed produced a negative balance for {key}: {balance}")

        docs = []
        entity_sets = [
            ("transaction", [t.id for t in ledger.transactions]),
            ("goal", [macbook.id, emergency.id, japan.id]),
            ("recurring_payment", [b.id for b in [*bills, salary_a, salary_b]]),
            ("debt", [paolo.id, mika.id, carlo.id, settled.id]),
            ("financial_note", list((await db.execute(select(FinancialNote.id).where(FinancialNote.user_id == user_id))).scalars())),
            ("budget", list((await db.execute(select(Budget.id).where(Budget.user_id == user_id))).scalars())),
        ]
        for entity_type, ids in entity_sets:
            for entity_id in ids:
                docs.extend(await render(db, user_id, entity_type, entity_id, "PHP"))
        await upsert_documents(db, user_id, docs)
        month = month_start(start)
        while month <= today:
            await index_monthly_summary(db, user_id, month_key(month), "PHP")
            month = add_months(month, 1)

    print(f"Seeded demo user {DEMO_EMAIL} with {len(ledger.transactions)} transactions and {len(docs)} memory documents.")
    print(f"Sign in with password: {password}")


async def main() -> None:
    try:
        await seed()
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
