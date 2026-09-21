"""Faldo Check: what a purchase does to Safe to Spend, this week, a budget and your goals.

Pure arithmetic on numbers the backend already calculated. The user decides; this only shows the impact.
"""
import math
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Literal

from app.engine.money import minor_factor
from app.engine.planning import goal_delay_days

Verdict = Literal["fits", "stretch", "over"]
DAYS_PER_MONTH = 30.4375


@dataclass(frozen=True)
class CheckInputs:
    amount_minor: int
    currency: str
    safe_raw_minor: int
    days_left: int
    week_left_minor: int
    planned_savings_minor: int
    goal_name: str | None = None
    goal_monthly_pace_minor: int | None = None
    budget_category: str | None = None
    budget_remaining_minor: int | None = None


def run_check(inputs: CheckInputs) -> dict[str, Any]:
    amount = inputs.amount_minor
    safe_before = max(0, inputs.safe_raw_minor)
    raw_after = inputs.safe_raw_minor - amount
    safe_after = max(0, raw_after)
    unit = minor_factor(inputs.currency)
    per_day_after = (safe_after // max(1, inputs.days_left)) // unit * unit
    week_left_after = inputs.week_left_minor - amount
    over_by = max(0, amount - safe_before)

    verdict: Verdict
    if over_by > 0:
        verdict = "over"
    elif amount > inputs.week_left_minor:
        verdict = "stretch"
    else:
        verdict = "fits"

    goal_impact = None
    if over_by and inputs.goal_name:
        at_risk = min(over_by, inputs.planned_savings_minor) if inputs.planned_savings_minor else over_by
        delay = goal_delay_days(at_risk, inputs.goal_monthly_pace_minor) if inputs.goal_monthly_pace_minor else None
        goal_impact = {"goal": inputs.goal_name, "savings_at_risk_minor": at_risk, "delay_days": delay, "is_estimate": True}

    budget_impact = None
    if inputs.budget_category is not None and inputs.budget_remaining_minor is not None:
        after = inputs.budget_remaining_minor - amount
        budget_impact = {"category": inputs.budget_category, "remaining_before_minor": inputs.budget_remaining_minor,
                         "remaining_after_minor": after, "would_exceed": after < 0}

    return {
        "amount_minor": amount,
        "verdict": verdict,
        "safe_before_minor": safe_before,
        "safe_after_minor": safe_after,
        "raw_after_minor": raw_after,
        "over_by_minor": over_by,
        "per_day_after_minor": per_day_after,
        "week_left_before_minor": inputs.week_left_minor,
        "week_left_after_minor": week_left_after,
        "goal_impact": goal_impact,
        "budget_impact": budget_impact,
    }


def affordable_on(amount_minor: int, safe_minor: int, monthly_surplus_minor: int | None, today: date) -> date | None:
    """Earliest date the purchase fits, if today's Safe to Spend plus the usual monthly surplus keeps coming in.

    An estimate from past months. None when there is no surplus to build on.
    """
    gap = amount_minor - max(0, safe_minor)
    if gap <= 0:
        return today
    if not monthly_surplus_minor or monthly_surplus_minor <= 0:
        return None
    return today + timedelta(days=math.ceil(gap / monthly_surplus_minor * DAYS_PER_MONTH))
