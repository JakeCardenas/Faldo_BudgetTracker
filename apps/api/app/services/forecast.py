import hashlib
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.engine.analysis import percentile
from app.engine.forecast import ForecastResult, KnownEvent, build_forecast
from app.engine.periods import add_months, month_end, month_start
from app.engine.planning import occurrences_between
from app.engine.safe_to_spend import MAX_CYCLE_DAYS, SafeToSpendInputs, compute_safe_to_spend, cycle_end, week_window
from app.engine.scenarios import Adjustment, run_scenario
from app.models import Account, Debt, PlannedPurchase, RecurringPayment, SavingsGoal, Transaction
from app.models.enums import (
    AccountType,
    DebtDirection,
    DebtStatus,
    Frequency,
    GoalStatus,
    RecurringKind,
    TransactionType,
)
from app.models.identity import UserSettings
from app.services.accounts import account_balances
from app.services.analytics import history_days
from app.services.goals import contributions_this_month
from app.services.recurring import upcoming

HISTORY_WINDOW_DAYS = 90


@dataclass
class ForecastInputs:
    today: date
    horizon_end: date
    start_balance_minor: int
    daily_discretionary: dict[date, int]
    history_days: int
    events: list[KnownEvent]
    planned_savings_minor: int
    buffer_minor: int
    seed: int
    top_goal_pace_minor: int | None


def _seed(user_id: uuid.UUID, today: date) -> int:
    return int(hashlib.sha256(f"{user_id}:{today.isoformat()}".encode()).hexdigest()[:8], 16)


async def scheduled_events(
    db: AsyncSession, user_id: uuid.UUID, today: date, horizon_end: date, spendable_ids: set[uuid.UUID],
) -> tuple[list[KnownEvent], int, int | None]:
    """Known money movements through the horizon: recurring bills and income, planned goal savings and money owed."""
    events: list[KnownEvent] = []
    for occ in await upcoming(db, user_id, today, horizon_end):
        if occ["account_id"] and uuid.UUID(occ["account_id"]) not in spendable_ids:
            continue
        sign = 1 if occ["is_income"] else -1
        kind = ("expected_income" if occ["is_one_time"] else "income") if occ["is_income"] else "bill"
        events.append(KnownEvent(date.fromisoformat(occ["due_on"]), sign * occ["amount_minor"], occ["name"], kind,
                                 occ["recurring_payment_id"]))

    goals = (
        await db.execute(
            select(SavingsGoal).where(SavingsGoal.user_id == user_id, SavingsGoal.status == GoalStatus.active,
                                      SavingsGoal.monthly_contribution_minor > 0)
        )
    ).scalars().all()
    contributed = await contributions_this_month(db, user_id, today)
    linked_ids = [g.linked_account_id for g in goals if g.linked_account_id]
    if linked_ids:
        linked_rows = (await db.execute(
            select(Transaction.to_account_id, func.sum(Transaction.amount_minor))
            .where(Transaction.user_id == user_id, Transaction.type == TransactionType.transfer,
                   Transaction.to_account_id.in_(linked_ids), Transaction.occurred_on >= month_start(today),
                   Transaction.occurred_on <= today)
            .group_by(Transaction.to_account_id)
        )).all()
        by_account = {aid: int(total) for aid, total in linked_rows}
        for g in goals:
            if g.linked_account_id:
                contributed[g.id] = contributed.get(g.id, 0) + by_account.get(g.linked_account_id, 0)
    planned_savings = 0
    top_pace = None
    for goal in goals:
        monthly = goal.monthly_contribution_minor or 0
        top_pace = max(top_pace or 0, monthly)
        remaining_now = max(0, monthly - contributed.get(goal.id, 0))
        if remaining_now:
            events.append(KnownEvent(min(today + timedelta(days=1), horizon_end), -remaining_now, goal.name, "savings", str(goal.id)))
            planned_savings += remaining_now
        m = add_months(month_start(today), 1)
        while m <= horizon_end:
            events.append(KnownEvent(m, -monthly, goal.name, "savings", str(goal.id)))
            planned_savings += monthly
            m = add_months(m, 1)

    debts = (
        await db.execute(
            select(Debt).where(Debt.user_id == user_id, Debt.direction == DebtDirection.i_owe,
                               Debt.status == DebtStatus.open, Debt.due_on.is_not(None), Debt.due_on <= horizon_end)
            .options(selectinload(Debt.payments))
        )
    ).scalars().all()
    for debt in debts:
        outstanding = debt.amount_minor - sum(p.amount_minor for p in debt.payments)
        if outstanding > 0 and debt.due_on:
            events.append(KnownEvent(debt.due_on, -outstanding, f"Pay {debt.counterparty}", "debt", str(debt.id)))
    return events, planned_savings, top_pace


async def planned_purchase_events(db: AsyncSession, user_id: uuid.UUID, today: date, horizon_end: date) -> list[KnownEvent]:
    """Planned purchases with a target date in the window. Forecast only: they are wishes, so Safe to Spend ignores them."""
    rows = (await db.execute(
        select(PlannedPurchase).where(PlannedPurchase.user_id == user_id, PlannedPurchase.status == "planned",
                                      PlannedPurchase.target_date.between(today, horizon_end))
    )).scalars().all()
    return [KnownEvent(p.target_date, -p.amount_minor, p.name, "planned", str(p.id)) for p in rows if p.target_date]


async def gather_inputs(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, horizon_end: date) -> ForecastInputs:
    balances = await account_balances(db, user_id, include_archived=False)
    spendable_ids = {b.account.id for b in balances if b.account.is_spendable}
    start_balance = sum(b.balance_minor for b in balances if b.account.is_spendable)
    days = await history_days(db, user_id, today)

    window_start = max(today - timedelta(days=HISTORY_WINDOW_DAYS), today - timedelta(days=max(days - 1, 0)))
    window_end = today - timedelta(days=1)
    rows = (
        await db.execute(
            select(Transaction.occurred_on, Transaction.amount_minor)
            .where(Transaction.user_id == user_id, Transaction.type == TransactionType.expense,
                   Transaction.recurring_payment_id.is_(None),
                   Transaction.occurred_on.between(window_start, window_end))
        )
    ).all()
    amounts = [a for _, a in rows]
    cap = percentile(amounts, 0.97) if len(amounts) >= 30 else None
    daily: dict[date, int] = {}
    if window_end >= window_start:
        for i in range((window_end - window_start).days + 1):
            daily[window_start + timedelta(days=i)] = 0
    for d, amount in rows:
        if cap is not None and amount > cap:
            continue
        daily[d] = daily.get(d, 0) + amount

    events, planned_savings, top_pace = await scheduled_events(db, user_id, today, horizon_end, spendable_ids)
    events += await planned_purchase_events(db, user_id, today, horizon_end)
    return ForecastInputs(
        today=today, horizon_end=horizon_end, start_balance_minor=start_balance, daily_discretionary=daily,
        history_days=days, events=events, planned_savings_minor=planned_savings,
        buffer_minor=settings.safe_to_spend_buffer_minor, seed=_seed(user_id, today), top_goal_pace_minor=top_pace,
    )


def resolve_horizon(today: date, horizon: str) -> date:
    if horizon == "end_of_month":
        end = month_end(today)
        return end if end > today else add_months(today, 1)
    if horizon in {"6_months", "12_months"}:
        return add_months(today, 6 if horizon == "6_months" else 12)
    return today + timedelta(days={"30_days": 30, "60_days": 60, "90_days": 90}.get(horizon, 30))


async def spendable_history(db: AsyncSession, user_id: uuid.UUID, start: date, today: date, current_balance: int) -> list[dict[str, Any]]:
    src = aliased(Account)
    dst = aliased(Account)
    rows = (
        await db.execute(
            select(Transaction.occurred_on, Transaction.type, Transaction.amount_minor, src.is_spendable, dst.is_spendable)
            .join(src, src.id == Transaction.account_id)
            .outerjoin(dst, dst.id == Transaction.to_account_id)
            .where(Transaction.user_id == user_id, Transaction.occurred_on > start, Transaction.occurred_on <= today)
        )
    ).all()
    net: dict[date, int] = {}
    for d, t, amount, src_spend, dst_spend in rows:
        change = 0
        if t in {TransactionType.income, TransactionType.debt_in} and src_spend:
            change = amount
        elif t in {TransactionType.expense, TransactionType.debt_out} and src_spend:
            change = -amount
        elif t == TransactionType.transfer:
            change = (-amount if src_spend else 0) + (amount if dst_spend else 0)
        net[d] = net.get(d, 0) + change
    series = []
    balance = current_balance
    for i in range((today - start).days, -1, -1):
        d = start + timedelta(days=i)
        series.append({"date": d.isoformat(), "balance_minor": balance})
        balance -= net.get(d, 0)
    series.reverse()
    return series


async def forecast(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, horizon: str = "end_of_month") -> dict[str, Any]:
    horizon_end = resolve_horizon(today, horizon)
    inputs = await gather_inputs(db, user_id, settings, today, horizon_end)
    result: ForecastResult = build_forecast(
        today=today, horizon_end=horizon_end, start_balance_minor=inputs.start_balance_minor,
        daily_discretionary=inputs.daily_discretionary, history_days=inputs.history_days,
        events=inputs.events, seed=inputs.seed,
    )
    data = result.as_dict()
    if any(e.kind == "expected_income" for e in result.events):
        data["assumptions"].append("One-time expected income is included on its date, but it may not arrive.")
    if any(e.kind == "planned" for e in result.events):
        data["assumptions"].append("Planned purchases with a target date are included on that date.")
    data["actual"] = await spendable_history(db, user_id, month_start(today), today, inputs.start_balance_minor)
    data["planned_savings_minor"] = inputs.planned_savings_minor
    data["buffer_minor"] = inputs.buffer_minor
    data["is_estimate"] = True
    return data


async def scenario(
    db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, adjustments: list[Adjustment],
    horizon: str = "end_of_month", budget_over: bool = False,
) -> dict[str, Any]:
    horizon_end = resolve_horizon(today, horizon)
    for adj in adjustments:
        if adj.on > horizon_end:
            horizon_end = adj.on
    inputs = await gather_inputs(db, user_id, settings, today, horizon_end)
    return run_scenario(
        today=today, horizon_end=horizon_end, start_balance_minor=inputs.start_balance_minor,
        daily_discretionary=inputs.daily_discretionary, history_days=inputs.history_days, events=inputs.events,
        adjustments=adjustments, planned_savings_minor=inputs.planned_savings_minor, buffer_minor=inputs.buffer_minor,
        seed=inputs.seed, budget_over=budget_over, goal_pace_minor=inputs.top_goal_pace_minor,
    )


async def next_income(db: AsyncSession, user_id: uuid.UUID, today: date) -> tuple[date, str] | None:
    """Next scheduled repeating income after today. Overdue, unreceived income is ignored: it isn't money yet.

    One-time expected income (frequency "once") never sets the window: it may not come, so nothing is planned on it.
    """
    rows = (await db.execute(
        select(RecurringPayment).where(RecurringPayment.user_id == user_id, RecurringPayment.is_active.is_(True),
                                       RecurringPayment.kind == RecurringKind.income,
                                       RecurringPayment.frequency != Frequency.once)
    )).scalars().all()
    best: tuple[date, str] | None = None
    start, end = today + timedelta(days=1), today + timedelta(days=MAX_CYCLE_DAYS)
    for r in rows:
        dates = occurrences_between(r.next_due_on, r.frequency.value, r.interval_count, start, end, r.end_on, r.anchor_day)
        if dates and (best is None or dates[0] < best[0]):
            best = (dates[0], r.name)
    return best


async def week_spending(
    db: AsyncSession, user_id: uuid.UUID, today: date, cycle_last_day: date, spendable_ids: set[uuid.UUID],
) -> tuple[date, date, int]:
    """Everyday spending this week from spendable accounts. The week restarts when money comes in."""
    if not spendable_ids:
        start, end = week_window(today, cycle_last_day, None)
        return start, end, 0
    last_income = await db.scalar(
        select(func.max(Transaction.occurred_on)).where(
            Transaction.user_id == user_id, Transaction.type == TransactionType.income,
            Transaction.account_id.in_(spendable_ids),
            Transaction.occurred_on.between(today - timedelta(days=6), today))
    )
    start, end = week_window(today, cycle_last_day, last_income)
    spent = await db.scalar(
        select(func.coalesce(func.sum(Transaction.amount_minor), 0)).where(
            Transaction.user_id == user_id, Transaction.type == TransactionType.expense,
            Transaction.account_id.in_(spendable_ids), Transaction.recurring_payment_id.is_(None),
            Transaction.occurred_on.between(start, today))
    )
    return start, end, int(spent or 0)


async def safe_to_spend(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> dict[str, Any]:
    balances = await account_balances(db, user_id, include_archived=False)
    spendable_ids = {b.account.id for b in balances if b.account.is_spendable}
    spendable = sum(b.balance_minor for b in balances if b.account.is_spendable)
    card_owed = -sum(min(0, b.balance_minor) for b in balances if b.account.type == AccountType.credit_card)
    income = await next_income(db, user_id, today)
    last_day, period = cycle_end(today, income[0] if income else None)
    events, _, _ = await scheduled_events(db, user_id, today, last_day, spendable_ids)
    week_start, week_end, spent = await week_spending(db, user_id, today, last_day, spendable_ids)
    from app.services.money_plan import plan_week

    plan = await plan_week(db, user_id, settings, today, week_start)
    result = compute_safe_to_spend(
        SafeToSpendInputs(
            today=today, currency=settings.currency, spendable_balance_minor=spendable,
            next_income_on=income[0] if income else None, next_income_label=income[1] if income else None,
            commitments=[e for e in events if e.kind in {"bill", "debt", "savings"}], card_owed_minor=card_owed,
            buffer_minor=settings.safe_to_spend_buffer_minor, week_start=week_start, week_end=week_end,
            spent_this_week_minor=spent, plan=plan,
        ),
        last_day, period,
    )
    return result.as_dict()
