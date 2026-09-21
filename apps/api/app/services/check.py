import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.check import CheckInputs, run_check
from app.models import Category, SavingsGoal
from app.models.enums import GoalStatus
from app.models.identity import UserSettings
from app.services.budgets import budget_status
from app.services.common import get_owned
from app.services.forecast import safe_to_spend


async def _focus_goal(db: AsyncSession, user_id: uuid.UUID) -> SavingsGoal | None:
    """The goal a purchase would most likely delay: nearest target date first, then the biggest monthly plan."""
    goals = (await db.execute(
        select(SavingsGoal).where(SavingsGoal.user_id == user_id, SavingsGoal.status == GoalStatus.active,
                                  SavingsGoal.monthly_contribution_minor > 0)
    )).scalars().all()
    if not goals:
        return None
    return sorted(goals, key=lambda g: (g.target_date is None, g.target_date or date.max, -(g.monthly_contribution_minor or 0)))[0]


async def check_purchase(
    db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, amount_minor: int,
    category_id: uuid.UUID | None = None, label: str | None = None,
) -> dict[str, Any]:
    sts = await safe_to_spend(db, user_id, settings, today)
    planned = next((line["amount_minor"] for line in sts["lines"] if line["key"] == "savings"), 0)
    goal = await _focus_goal(db, user_id)

    budget_name = budget_remaining = None
    essential = False
    if category_id:
        category = await get_owned(db, Category, category_id, user_id, "Category")
        parent = await db.get(Category, category.parent_id) if category.parent_id else None
        essential = (parent or category).is_essential
        status = await budget_status(db, user_id, today, today)
        line = next((ln for ln in status.lines if ln.category_id in {category.id, category.parent_id}), None)
        if line:
            budget_name, budget_remaining = line.category_name, line.remaining_minor

    result = run_check(CheckInputs(
        amount_minor=amount_minor, currency=settings.currency, safe_raw_minor=sts["raw_minor"], days_left=sts["days_left"],
        week_left_minor=sts["week"]["left_minor"], planned_savings_minor=planned,
        goal_name=goal.name if goal else None, goal_monthly_pace_minor=goal.monthly_contribution_minor if goal else None,
        budget_category=budget_name, budget_remaining_minor=budget_remaining,
    ))
    plan = sts["week"].get("plan")
    if plan:
        bucket = "needs" if essential else "joy"
        left = plan[f"{bucket}_left_minor"]
        result["plan_impact"] = {"bucket": bucket, "left_before_minor": left, "left_after_minor": left - amount_minor}
    else:
        result["plan_impact"] = None
    commitments = [item for line in sts["lines"] if line["key"] in {"bills", "debts"} for item in line.get("items", [])]
    result.update({
        "label": label,
        "until": sts["until"],
        "period": sts["period"],
        "next_income_on": sts["next_income_on"],
        "next_income_label": sts["next_income_label"],
        "days_left": sts["days_left"],
        "buffer_minor": sts["buffer_minor"],
        "commitments": commitments[:8],
        "commitments_minor": sum(item["amount_minor"] for item in commitments),
        "safe_to_spend": sts,
    })
    return result
