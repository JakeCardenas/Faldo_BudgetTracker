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
from app.engine.scenarios import Adjustment, run_scenario
from app.models import Account, Debt, SavingsGoal, Transaction
from app.models.enums import DebtDirection, DebtStatus, GoalStatus, TransactionType
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

    events: list[KnownEvent] = []
    for occ in await upcoming(db, user_id, today, horizon_end):
        if occ["account_id"] and uuid.UUID(occ["account_id"]) not in spendable_ids:
            continue
        sign = 1 if occ["is_income"] else -1
        events.append(KnownEvent(date.fromisoformat(occ["due_on"]), sign * occ["amount_minor"], occ["name"],
                                 "income" if occ["is_income"] else "bill", occ["recurring_payment_id"]))

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

    return ForecastInputs(
        today=today, horizon_end=horizon_end, start_balance_minor=start_balance, daily_discretionary=daily,
        history_days=days, events=events, planned_savings_minor=planned_savings,
        buffer_minor=settings.safe_to_spend_buffer_minor, seed=_seed(user_id, today), top_goal_pace_minor=top_pace,
    )


def resolve_horizon(today: date, horizon: str) -> date:
    if horizon == "end_of_month":
        end = month_end(today)
        return end if end > today else add_months(today, 1)
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
        if t == TransactionType.income and src_spend:
            change = amount
        elif t == TransactionType.expense and src_spend:
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


async def safe_to_spend(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> dict[str, Any]:
    horizon_end = month_end(today)
    inputs = await gather_inputs(db, user_id, settings, today, horizon_end)
    income = sum(e.amount_minor for e in inputs.events if e.kind == "income")
    bills = -sum(e.amount_minor for e in inputs.events if e.kind in {"bill", "debt"})
    savings = inputs.planned_savings_minor
    balances = await account_balances(db, user_id, include_archived=False)
    card_owed = -sum(min(0, b.balance_minor) for b in balances if b.account.type.value == "credit_card")
    lines = [
        {"label": "Spendable balance", "amount_minor": inputs.start_balance_minor, "op": "start"},
        {"label": "Expected income this month", "amount_minor": income, "op": "add"},
        {"label": "Bills due this month", "amount_minor": bills, "op": "subtract"},
        {"label": "Planned savings", "amount_minor": savings, "op": "subtract"},
        {"label": "Credit card balance owed", "amount_minor": card_owed, "op": "subtract"},
        {"label": "Safety buffer", "amount_minor": inputs.buffer_minor, "op": "subtract"},
    ]
    raw = inputs.start_balance_minor + income - bills - savings - card_owed - inputs.buffer_minor
    days_left = max(1, (horizon_end - today).days + 1)
    amount = max(0, raw)
    return {
        "amount_minor": amount,
        "raw_minor": raw,
        "per_day_minor": (amount // days_left) // 100 * 100,
        "days_left": days_left,
        "until": horizon_end.isoformat(),
        "lines": lines,
        "shortfall_minor": -raw if raw < 0 else 0,
        "note": "Excludes everyday spending you haven't made yet. Expected income is based on your recurring income.",
    }
