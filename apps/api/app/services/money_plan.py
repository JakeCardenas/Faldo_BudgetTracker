"""Money Plan service: the user's plan for each income, on top of real bills, goals and spending."""
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.engine.money_plan import (
    DAYS_PER_MONTH,
    PERIOD_DAYS,
    PERIODS_PER_MONTH_LABEL,
    PlanInputs,
    allocate,
    per_period,
    share_of,
    template_60_20_20,
)
from app.engine.periods import month_end, month_start
from app.engine.planning import monthly_equivalent, occurrences_between
from app.engine.safe_to_spend import MAX_CYCLE_DAYS, PlanWeek
from app.models import Category, MoneyPlan, RecurringPayment, SavingsGoal, Transaction
from app.models.enums import CategoryKind, Frequency, GoalStatus, RecurringKind, TransactionType
from app.models.identity import UserSettings
from app.schemas.planning import MoneyPlanIn


@dataclass(frozen=True)
class PlanPeriod:
    frequency: str
    days: Decimal
    has_schedule: bool
    income_name: str | None
    scheduled_income_minor: int | None
    next_income_on: date | None


async def primary_income(db: AsyncSession, user_id: uuid.UUID, today: date) -> tuple[RecurringPayment, date] | None:
    """The repeating income that arrives next. Same rule as Safe to Spend; one-time income never counts."""
    rows = (await db.execute(
        select(RecurringPayment).where(RecurringPayment.user_id == user_id, RecurringPayment.is_active.is_(True),
                                       RecurringPayment.kind == RecurringKind.income,
                                       RecurringPayment.frequency != Frequency.once)
    )).scalars().all()
    best: tuple[RecurringPayment, date] | None = None
    for r in rows:
        dates = occurrences_between(r.next_due_on, r.frequency.value, r.interval_count, today + timedelta(days=1),
                                    today + timedelta(days=MAX_CYCLE_DAYS * 12), r.end_on, r.anchor_day)
        if dates and (best is None or dates[0] < best[1]):
            best = (r, dates[0])
    return best


async def plan_period(db: AsyncSession, user_id: uuid.UUID, today: date) -> PlanPeriod:
    income = await primary_income(db, user_id, today)
    if income is None or income[0].frequency.value not in PERIOD_DAYS:
        return PlanPeriod("monthly", DAYS_PER_MONTH, False, None, None, None)
    r, next_on = income
    return PlanPeriod(r.frequency.value, PERIOD_DAYS[r.frequency.value] * r.interval_count, True, r.name, r.amount_minor, next_on)


async def period_bounds(db: AsyncSession, user_id: uuid.UUID, today: date, period: PlanPeriod) -> tuple[date, date]:
    """The pay period we're in: from the last payday to the day before the next one (or the calendar month)."""
    if not period.has_schedule or period.next_income_on is None:
        return month_start(today), month_end(today)
    span = int(period.days.to_integral_value())
    last_income = await db.scalar(
        select(func.max(Transaction.occurred_on)).where(
            Transaction.user_id == user_id, Transaction.type == TransactionType.income,
            Transaction.occurred_on.between(today - timedelta(days=span + 3), today))
    )
    start = last_income or period.next_income_on - timedelta(days=span)
    return min(start, today), period.next_income_on - timedelta(days=1)


async def bucket_spending(db: AsyncSession, user_id: uuid.UUID, start: date, end: date) -> tuple[int, int]:
    """(needs, joy) spent between two dates. Needs are categories marked essential; everything else is Joy Money.

    Bills paid through a recurring schedule are already in the plan as bills, so they don't count here.
    """
    essential = func.coalesce(Category.is_essential, False)
    row = (await db.execute(
        select(
            func.coalesce(func.sum(case((essential, Transaction.amount_minor), else_=0)), 0),
            func.coalesce(func.sum(case((essential, 0), else_=Transaction.amount_minor)), 0),
        )
        .select_from(Transaction)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(Transaction.user_id == user_id, Transaction.type == TransactionType.expense,
               Transaction.recurring_payment_id.is_(None), Transaction.occurred_on.between(start, end))
    )).one()
    return int(row[0]), int(row[1])


async def monthly_commitments(db: AsyncSession, user_id: uuid.UUID) -> int:
    rows = (await db.execute(
        select(RecurringPayment).where(RecurringPayment.user_id == user_id, RecurringPayment.is_active.is_(True),
                                       RecurringPayment.kind != RecurringKind.income)
    )).scalars().all()
    return sum(monthly_equivalent(r.amount_minor, r.frequency.value, r.interval_count) for r in rows)


async def monthly_goal_savings(db: AsyncSession, user_id: uuid.UUID) -> int:
    return int(await db.scalar(
        select(func.coalesce(func.sum(SavingsGoal.monthly_contribution_minor), 0)).where(
            SavingsGoal.user_id == user_id, SavingsGoal.status == GoalStatus.active)
    ) or 0)


def _period_label(period: PlanPeriod) -> str:
    if not period.has_schedule:
        return "Each month"
    return f"{period.income_name}, {PERIODS_PER_MONTH_LABEL[period.frequency]}"


async def get_money_plan(
    db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, draft: MoneyPlanIn | None = None,
) -> dict[str, Any]:
    """The plan with its allocation. A draft previews unsaved changes with the same arithmetic."""
    cur = settings.currency
    plan = await db.get(MoneyPlan, user_id)
    period = await plan_period(db, user_id, today)
    commitments = per_period(await monthly_commitments(db, user_id), period.days, cur)
    goal_savings = per_period(await monthly_goal_savings(db, user_id), period.days, cur)
    custom_income = draft.income_minor if draft else (plan.income_minor if plan else None)
    income = custom_income or period.scheduled_income_minor
    source = "custom" if custom_income else ("schedule" if period.scheduled_income_minor else None)
    start, end = await period_bounds(db, user_id, today, period)

    template: str
    if draft:
        savings, joy, buffer, needs_set, template = (draft.savings_minor, draft.joy_minor, draft.buffer_minor,
                                                     draft.needs_minor, draft.template)
    elif plan:
        savings, joy, buffer, needs_set, template = (plan.savings_minor, plan.joy_minor, plan.buffer_minor,
                                                     plan.needs_minor, plan.template)
    else:
        savings, joy, buffer, needs_set, template = goal_savings, 0, 0, None, "custom"
    stored = {"savings_minor": savings, "joy_minor": joy, "buffer_minor": buffer, "needs_minor": needs_set,
              "template": template, "income_minor": custom_income}

    categories = (await db.execute(
        select(Category).where(Category.user_id == user_id, Category.kind == CategoryKind.expense, Category.parent_id.is_(None))
        .order_by(Category.name)
    )).scalars().all()
    out: dict[str, Any] = {
        "configured": plan is not None,
        "period": {"frequency": period.frequency, "label": _period_label(period), "days": float(period.days),
                   "has_schedule": period.has_schedule, "income_name": period.income_name,
                   "start": start.isoformat(), "end": end.isoformat()},
        "income": {"minor": income, "source": source, "scheduled_minor": period.scheduled_income_minor},
        "commitments_minor": commitments,
        "goal_savings_minor": goal_savings,
        "plan": stored,
        "allocation": None,
        "template_60_20_20": None,
        "weekly": None,
        "this_period": None,
        "categories": [{"id": str(c.id), "name": c.name, "is_essential": c.is_essential, "icon": c.icon, "color": c.color}
                       for c in categories],
    }
    if not income:
        return out
    allocation = allocate(PlanInputs(
        currency=cur, income_minor=income, commitments_minor=commitments, goal_savings_minor=goal_savings,
        savings_minor=savings, joy_minor=joy, buffer_minor=buffer, needs_minor=needs_set,
    ))
    out["allocation"] = allocation
    out["template_60_20_20"] = template_60_20_20(income, commitments, cur)
    out["weekly"] = {"joy_minor": share_of(joy, period.days, 7, cur),
                     "needs_minor": share_of(allocation["needs_minor"], period.days, 7, cur)}
    needs_spent, joy_spent = await bucket_spending(db, user_id, start, today)
    out["this_period"] = {
        "joy_minor": joy, "joy_spent_minor": joy_spent, "joy_left_minor": joy - joy_spent,
        "needs_minor": allocation["needs_minor"], "needs_spent_minor": needs_spent,
        "needs_left_minor": allocation["needs_minor"] - needs_spent,
    }
    return out


async def save_money_plan(db: AsyncSession, user_id: uuid.UUID, today: date, data: MoneyPlanIn) -> None:
    period = await plan_period(db, user_id, today)
    if not data.income_minor and not period.scheduled_income_minor:
        raise AppError("Enter how much you plan with each month, or add your income schedule first.")
    plan = await db.get(MoneyPlan, user_id)
    if plan is None:
        plan = MoneyPlan(user_id=user_id)
        db.add(plan)
    plan.income_minor = data.income_minor
    plan.savings_minor = data.savings_minor
    plan.joy_minor = data.joy_minor
    plan.buffer_minor = data.buffer_minor
    plan.needs_minor = data.needs_minor
    plan.template = data.template
    await db.flush()


async def delete_money_plan(db: AsyncSession, user_id: uuid.UUID) -> None:
    plan = await db.get(MoneyPlan, user_id)
    if plan is not None:
        await db.delete(plan)
        await db.flush()


async def plan_week(
    db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, week_start: date,
) -> PlanWeek | None:
    """What the Money Plan allows for needs and Joy Money this week, for the weekly figure. None without a plan."""
    plan = await db.get(MoneyPlan, user_id)
    if plan is None:
        return None
    period = await plan_period(db, user_id, today)
    income = plan.income_minor or period.scheduled_income_minor
    if not income:
        return None
    commitments = per_period(await monthly_commitments(db, user_id), period.days, settings.currency)
    allocation = allocate(PlanInputs(
        currency=settings.currency, income_minor=income, commitments_minor=commitments, goal_savings_minor=0,
        savings_minor=plan.savings_minor, joy_minor=plan.joy_minor, buffer_minor=plan.buffer_minor, needs_minor=plan.needs_minor,
    ))
    needs_spent, joy_spent = await bucket_spending(db, user_id, week_start, today)
    return PlanWeek(joy_per_period_minor=plan.joy_minor, needs_per_period_minor=allocation["needs_minor"], period_days=period.days,
                    joy_spent_minor=joy_spent, needs_spent_minor=needs_spent)
