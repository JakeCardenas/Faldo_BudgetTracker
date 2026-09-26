import asyncio
import uuid
from datetime import date, timedelta

from sqlalchemy import event, update

from app.core import db as db_module
from app.core.db import scoped_session
from app.engine.periods import today_in
from app.models import Account, RecurringPayment
from app.services.accounts import account_balances

P = 100
TODAY = today_in("Asia/Manila")


async def _account(client, name="GCash", type_="e_wallet", opening=10_000 * P, **extra):  # type: ignore[no-untyped-def]
    r = await client.post("/api/v1/accounts", json={"name": name, "type": type_, "opening_balance_minor": opening, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def _category(client, name: str, kind: str = "expense") -> str:  # type: ignore[no-untyped-def]
    cats = (await client.get("/api/v1/categories")).json()
    return next(c["id"] for c in cats if c["name"] == name and c["kind"] == kind)


async def _user_id(client) -> uuid.UUID:  # type: ignore[no-untyped-def]
    return uuid.UUID((await client.get("/api/v1/me")).json()["id"])


async def _archive(client, account_id: str) -> None:  # type: ignore[no-untyped-def]
    r = await client.patch(f"/api/v1/accounts/{account_id}", json={"archived": True})
    assert r.status_code == 200, r.text


async def test_linked_goal_contribution_counts_once_in_forecast_and_safe_to_spend(client):
    gcash = await _account(client, opening=100_000 * P)
    savings = await _account(client, "Savings", "savings", 0)
    await client.patch("/api/v1/me/settings", json={"safe_to_spend_buffer_minor": 0})
    goal = (await client.post("/api/v1/goals", json={"name": "Emergency", "target_minor": 60_000 * P,
                                                     "monthly_contribution_minor": 6_000 * P,
                                                     "linked_account_id": savings["id"]})).json()
    r = await client.post(f"/api/v1/goals/{goal['id']}/contributions",
                          json={"amount_minor": 2_000 * P, "occurred_on": TODAY.isoformat(), "from_account_id": gcash["id"]})
    assert r.status_code == 201, r.text

    fc = (await client.get("/api/v1/forecast", params={"horizon": "30_days"})).json()
    first = next(e for e in fc["events"] if e["kind"] == "savings")
    assert first["amount_minor"] == -4_000 * P

    sts = (await client.get("/api/v1/dashboard")).json()["safe_to_spend"]
    line = next(line for line in sts["lines"] if line["key"] == "savings")
    this_month = [i for i in line["items"] if i["date"] <= (TODAY + timedelta(days=1)).isoformat()]
    assert sum(i["amount_minor"] for i in this_month) == 4_000 * P


async def test_accounts_must_use_the_users_currency(client):
    r = await client.post("/api/v1/accounts", json={"name": "Wise", "type": "bank", "currency": "USD"})
    assert r.status_code == 400
    assert "PHP" in r.json()["detail"]
    same = await _account(client, "BPI", "bank", currency="PHP")
    assert same["currency"] == "PHP"
    assert all(a["currency"] == "PHP" for a in (await client.get("/api/v1/accounts")).json())


async def test_transfers_between_currencies_are_refused(client):
    gcash = await _account(client)
    # An account left over from before one currency per user was enforced.
    wise = await _account(client, "Wise", "bank")
    async with scoped_session(await _user_id(client)) as session:
        await session.execute(update(Account).values(currency="USD").where(Account.id == uuid.UUID(wise["id"])))
    usd = next(a for a in (await client.get("/api/v1/accounts")).json() if a["name"] == "Wise")
    assert usd["currency"] == "USD"
    r = await client.post("/api/v1/transactions", json={"type": "transfer", "amount_minor": 1_000 * P, "occurred_on": TODAY.isoformat(),
                                                        "account_id": gcash["id"], "to_account_id": usd["id"]})
    assert r.status_code == 400 and "currency" in r.json()["detail"]
    balances = {a["name"]: a["balance_minor"] for a in (await client.get("/api/v1/accounts")).json()}
    assert balances["GCash"] == 10_000 * P and balances["Wise"] == 10_000 * P


async def test_concurrent_debt_payments_cannot_overpay(client):
    debt = (await client.post("/api/v1/debts", json={"direction": "owed_to_me", "counterparty": "Mika", "amount_minor": 1_000 * P})).json()

    async def pay():  # type: ignore[no-untyped-def]
        return await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 1_000 * P, "paid_on": TODAY.isoformat()})

    results = await asyncio.gather(*(pay() for _ in range(4)))
    assert sorted(r.status_code for r in results) == [201, 400, 400, 400]
    after = next(d for d in (await client.get("/api/v1/debts")).json() if d["id"] == debt["id"])
    assert after["paid_minor"] == 1_000 * P and after["status"] == "settled" and len(after["payments"]) == 1


async def test_recurring_category_must_match_its_kind(client):
    gcash = await _account(client)
    food = await _category(client, "Food & Dining")
    salary = await _category(client, "Salary", "income")
    due = (TODAY + timedelta(days=3)).isoformat()

    r = await client.post("/api/v1/recurring", json={"name": "Salary", "kind": "income", "amount_minor": 20_000 * P, "frequency": "monthly",
                                                     "next_due_on": due, "account_id": gcash["id"], "category_id": food})
    assert r.status_code == 400 and "income category" in r.json()["detail"]
    r = await client.post("/api/v1/recurring", json={"name": "Groceries", "kind": "bill", "amount_minor": 2_000 * P, "frequency": "monthly",
                                                     "next_due_on": due, "account_id": gcash["id"], "category_id": salary})
    assert r.status_code == 400 and "expense category" in r.json()["detail"]

    bill = (await client.post("/api/v1/recurring", json={"name": "Groceries", "kind": "bill", "amount_minor": 2_000 * P,
                                                         "frequency": "monthly", "next_due_on": due, "account_id": gcash["id"],
                                                         "category_id": food})).json()
    assert (await client.patch(f"/api/v1/recurring/{bill['id']}", json={"category_id": salary})).status_code == 400
    assert (await client.patch(f"/api/v1/recurring/{bill['id']}", json={"kind": "income"})).status_code == 400
    r = await client.patch(f"/api/v1/recurring/{bill['id']}", json={"kind": "income", "category_id": salary})
    assert r.status_code == 200 and r.json()["kind"] == "income"

    paid = await client.post(f"/api/v1/recurring/{bill['id']}/pay", json={})
    assert paid.status_code == 200, paid.text
    assert paid.json()["type"] == "income" and paid.json()["category_id"] == salary


async def test_mark_paid_records_an_older_mismatched_item_uncategorized(client):
    gcash = await _account(client)
    salary = await _category(client, "Salary", "income")
    bill = (await client.post("/api/v1/recurring", json={"name": "Rent", "kind": "rent", "amount_minor": 8_000 * P, "frequency": "monthly",
                                                         "next_due_on": TODAY.isoformat(), "account_id": gcash["id"]})).json()
    async with scoped_session(await _user_id(client)) as session:
        await session.execute(update(RecurringPayment).values(category_id=uuid.UUID(salary))
                              .where(RecurringPayment.id == uuid.UUID(bill["id"])))

    paid = await client.post(f"/api/v1/recurring/{bill['id']}/pay", json={})
    assert paid.status_code == 200, paid.text
    assert paid.json()["type"] == "expense" and paid.json()["category_id"] is None


async def test_archived_accounts_refuse_new_money(client):
    gcash = await _account(client)
    bank = await _account(client, "BPI", "bank")
    old = await _account(client, "Old wallet", "cash", 0)
    food = await _category(client, "Food & Dining")
    expense = {"type": "expense", "amount_minor": 100 * P, "occurred_on": TODAY.isoformat(), "category_id": food}
    history = (await client.post("/api/v1/transactions", json={**expense, "account_id": old["id"]})).json()
    txn = (await client.post("/api/v1/transactions", json={**expense, "account_id": gcash["id"]})).json()
    await _archive(client, old["id"])

    r = await client.post("/api/v1/transactions", json={**expense, "account_id": old["id"]})
    assert r.status_code == 400 and "archived" in r.json()["detail"]
    r = await client.put(f"/api/v1/transactions/{txn['id']}", json={**expense, "account_id": old["id"]})
    assert r.status_code == 400 and "archived" in r.json()["detail"]
    transfer = {"type": "transfer", "amount_minor": 100 * P, "occurred_on": TODAY.isoformat()}
    r = await client.post("/api/v1/transactions", json={**transfer, "account_id": gcash["id"], "to_account_id": old["id"]})
    assert r.status_code == 400 and "archived" in r.json()["detail"]
    r = await client.post("/api/v1/transactions", json={**transfer, "account_id": old["id"], "to_account_id": bank["id"]})
    assert r.status_code == 400 and "archived" in r.json()["detail"]

    # Correcting a transaction already on the archived account still works.
    r = await client.put(f"/api/v1/transactions/{history['id']}", json={**expense, "account_id": old["id"], "notes": "Lunch"})
    assert r.status_code == 200, r.text

    bill = (await client.post("/api/v1/recurring", json={"name": "Load", "kind": "bill", "amount_minor": 100 * P, "frequency": "monthly",
                                                         "next_due_on": TODAY.isoformat(), "account_id": gcash["id"]})).json()
    r = await client.post(f"/api/v1/recurring/{bill['id']}/pay", json={"account_id": old["id"]})
    assert r.status_code == 400 and "archived" in r.json()["detail"]


async def test_balance_history_uses_a_fixed_number_of_queries(client):
    gcash = await _account(client, opening=5_000 * P)
    card = await _account(client, "Visa", "credit_card", 0, credit_limit_minor=50_000 * P)
    food = await _category(client, "Food & Dining")
    for days_ago, account, amount in [(200, gcash, 300), (40, card, 1_200), (3, gcash, 150), (0, card, 80)]:
        r = await client.post("/api/v1/transactions", json={"type": "expense", "amount_minor": amount * P, "account_id": account["id"],
                                                            "occurred_on": (TODAY - timedelta(days=days_ago)).isoformat(), "category_id": food})
        assert r.status_code == 201, r.text
    r = await client.post("/api/v1/transactions", json={"type": "transfer", "amount_minor": 500 * P, "account_id": gcash["id"],
                                                        "to_account_id": card["id"], "occurred_on": (TODAY - timedelta(days=10)).isoformat()})
    assert r.status_code == 201, r.text

    statements: list[str] = []

    def count(conn, cursor, statement, *args):  # type: ignore[no-untyped-def]
        statements.append(statement)

    engine = db_module.get_engine().sync_engine
    counts = {}
    responses = {}
    event.listen(engine, "before_cursor_execute", count)
    try:
        for days in (7, 90, 365):
            statements.clear()
            r = await client.get("/api/v1/accounts/balance-history", params={"days": days})
            assert r.status_code == 200, r.text
            counts[days] = len(statements)
            responses[days] = r.json()
    finally:
        event.remove(engine, "before_cursor_execute", count)
    assert counts[7] == counts[90] == counts[365]

    user_id = await _user_id(client)
    async with scoped_session(user_id) as session:
        for days, points in responses.items():
            step = max(1, days // 30)
            offsets = sorted({*range(days, -1, -step), 0}, reverse=True)
            assert [p["date"] for p in points] == [(TODAY - timedelta(days=o)).isoformat() for o in offsets]
            for point in points:
                balances = await account_balances(session, user_id, as_of=date.fromisoformat(point["date"]), include_archived=False)
                assets = sum(b.balance_minor for b in balances if b.balance_minor > 0)
                liabilities = sum(-b.balance_minor for b in balances if b.balance_minor < 0)
                assert point == {"date": point["date"], "assets_minor": assets, "liabilities_minor": liabilities,
                                 "net_minor": assets - liabilities}
