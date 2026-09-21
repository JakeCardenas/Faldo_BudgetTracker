"""Money Plan: give each income a job.

Every payday's money is split into bills (from the recurring schedule), savings, a buffer top-up, Joy Money (wants,
spent without guilt) and needs (day-to-day essentials). The user sets the amounts; 60/20/20 is only a starting point.
All amounts are integer minor units per pay period.
"""
from dataclasses import dataclass
from decimal import ROUND_FLOOR, Decimal
from typing import Any

from app.engine.money import minor_factor

DAYS_PER_MONTH = Decimal("30.4375")
PERIOD_DAYS: dict[str, Decimal] = {
    "weekly": Decimal(7),
    "biweekly": Decimal(14),
    "semi_monthly": Decimal("365.25") / 24,
    "monthly": DAYS_PER_MONTH,
    "quarterly": Decimal("91.3125"),
    "yearly": Decimal("365.25"),
}
PERIODS_PER_MONTH_LABEL = {
    "weekly": "every week", "biweekly": "every 2 weeks", "semi_monthly": "twice a month", "monthly": "every month",
    "quarterly": "every quarter", "yearly": "every year",
}


def floor_unit(amount: Decimal | int, currency: str) -> int:
    unit = minor_factor(currency)
    return int((Decimal(amount) / unit).to_integral_value(ROUND_FLOOR)) * unit


def per_period(monthly_minor: int, period_days: Decimal, currency: str) -> int:
    """A monthly amount expressed per pay period (rounded down to a whole unit)."""
    return floor_unit(Decimal(monthly_minor) * period_days / DAYS_PER_MONTH, currency)


def share_of(amount_per_period: int, period_days: Decimal, days: int, currency: str) -> int:
    """The part of a per-period amount that belongs to a stretch of `days` days."""
    if period_days <= 0:
        return 0
    return floor_unit(Decimal(amount_per_period) * days / period_days, currency)


@dataclass(frozen=True)
class PlanInputs:
    currency: str
    income_minor: int
    commitments_minor: int
    goal_savings_minor: int
    savings_minor: int
    joy_minor: int
    buffer_minor: int
    needs_minor: int | None = None


def allocate(p: PlanInputs) -> dict[str, Any]:
    fixed = p.commitments_minor + p.savings_minor + p.buffer_minor
    needs = p.needs_minor if p.needs_minor is not None else max(0, p.income_minor - fixed - p.joy_minor)
    unassigned = p.income_minor - fixed - needs - p.joy_minor

    def pct(amount: int) -> float | None:
        if p.income_minor <= 0:
            return None
        return float((Decimal(amount) * 100 / p.income_minor).quantize(Decimal("0.1")))

    buckets: list[dict[str, Any]] = [
        {"key": "commitments", "label": "Bills and subscriptions", "amount_minor": p.commitments_minor, "auto": True},
        {"key": "needs", "label": "Needs", "amount_minor": needs, "auto": p.needs_minor is None},
        {"key": "joy", "label": "Joy Money", "amount_minor": p.joy_minor, "auto": False},
        {"key": "savings", "label": "Savings", "amount_minor": p.savings_minor, "auto": False},
        {"key": "buffer", "label": "Buffer top-up", "amount_minor": p.buffer_minor, "auto": False},
    ]
    for bucket in buckets:
        bucket["pct"] = pct(bucket["amount_minor"])

    warnings: list[dict[str, Any]] = []
    if p.commitments_minor > p.income_minor:
        warnings.append({"code": "bills_exceed_income", "amount_minor": p.commitments_minor - p.income_minor})
    if unassigned < 0:
        warnings.append({"code": "over_assigned", "amount_minor": -unassigned})
    if p.savings_minor < p.goal_savings_minor:
        warnings.append({"code": "savings_below_goals", "amount_minor": p.goal_savings_minor - p.savings_minor})
    return {"buckets": buckets, "needs_minor": needs, "unassigned_minor": unassigned, "warnings": warnings,
            "pct_unassigned": pct(unassigned)}


def template_60_20_20(income_minor: int, commitments_minor: int, currency: str) -> dict[str, Any]:
    """60% needs (bills included), 20% wants as Joy Money, 20% savings. A starting point the user adjusts."""
    savings = floor_unit(Decimal(income_minor) * Decimal("0.2"), currency)
    joy = floor_unit(Decimal(income_minor) * Decimal("0.2"), currency)
    needs_total = floor_unit(Decimal(income_minor) * Decimal("0.6"), currency)
    return {"savings_minor": savings, "joy_minor": joy, "buffer_minor": 0,
            "needs_minor": max(0, needs_total - commitments_minor),
            "bills_over_needs_share_minor": max(0, commitments_minor - needs_total)}
