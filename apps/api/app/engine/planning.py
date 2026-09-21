from dataclasses import asdict, dataclass
from datetime import date, timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

from app.engine.money import percent
from app.engine.periods import add_months, month_elapsed_fraction, month_end, month_start

AT_RISK_MARGIN = 0.10


@dataclass(frozen=True)
class BudgetLineStatus:
    limit_minor: int
    spent_minor: int
    remaining_minor: int
    pct_used: float
    pct_month_elapsed: float
    projected_minor: int
    status: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def budget_line_status(limit_minor: int, spent_minor: int, today: date, month: date) -> BudgetLineStatus:
    elapsed = month_elapsed_fraction(today, month)
    pct_used = percent(spent_minor, limit_minor) or 0.0
    projected = spent_minor if elapsed >= 1.0 or elapsed == 0.0 else round(spent_minor / elapsed / 100) * 100
    if spent_minor > limit_minor:
        status = "over"
    elif spent_minor == limit_minor:
        status = "at_limit"
    elif elapsed < 1.0 and projected > limit_minor and pct_used / 100 > elapsed + AT_RISK_MARGIN:
        status = "at_risk"
    elif pct_used >= 85:
        status = "near_limit"
    else:
        status = "on_track"
    return BudgetLineStatus(
        limit_minor=limit_minor,
        spent_minor=spent_minor,
        remaining_minor=limit_minor - spent_minor,
        pct_used=pct_used,
        pct_month_elapsed=round(elapsed * 100, 1),
        projected_minor=projected,
        status=status,
    )


@dataclass(frozen=True)
class GoalProgress:
    target_minor: int
    saved_minor: int
    remaining_minor: int
    pct_complete: float
    months_remaining: float | None
    required_monthly_minor: int | None
    planned_monthly_minor: int | None
    average_monthly_minor: int
    projected_completion_on: date | None
    on_track: bool | None
    status_reason: str

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["projected_completion_on"] = self.projected_completion_on.isoformat() if self.projected_completion_on else None
        return data


def months_between(start: date, end: date) -> float:
    return max(0.0, (end - start).days / 30.4375)


def goal_progress(
    *,
    target_minor: int,
    saved_minor: int,
    today: date,
    target_date: date | None,
    planned_monthly_minor: int | None,
    average_monthly_minor: int,
) -> GoalProgress:
    remaining = max(0, target_minor - saved_minor)
    pct = min(100.0, percent(saved_minor, target_minor) or 0.0)
    months_left = months_between(today, target_date) if target_date else None

    required = None
    if target_date and remaining > 0:
        required = int((Decimal(remaining) / Decimal(max(months_left or 0, 1))).to_integral_value(ROUND_CEILING))

    pace = planned_monthly_minor if planned_monthly_minor else average_monthly_minor
    projected: date | None = None
    if remaining == 0:
        projected = today
    elif pace and pace > 0:
        months_needed = remaining / pace
        projected = today + timedelta(days=round(months_needed * 30.4375))

    on_track: bool | None
    if remaining == 0:
        on_track, reason = True, "completed"
    elif target_date is None:
        on_track, reason = None, "no_target_date"
    elif projected is None:
        on_track, reason = False, "no_contributions"
    elif projected <= target_date:
        on_track, reason = True, "on_pace"
    else:
        on_track, reason = False, "behind_pace"

    return GoalProgress(
        target_minor=target_minor,
        saved_minor=saved_minor,
        remaining_minor=remaining,
        pct_complete=pct,
        months_remaining=round(months_left, 1) if months_left is not None else None,
        required_monthly_minor=required,
        planned_monthly_minor=planned_monthly_minor,
        average_monthly_minor=average_monthly_minor,
        projected_completion_on=projected,
        on_track=on_track,
        status_reason=reason,
    )


def goal_delay_days(purchase_minor: int, monthly_pace_minor: int) -> int | None:
    if monthly_pace_minor <= 0:
        return None
    return round(purchase_minor / monthly_pace_minor * 30.4375)


def advance_due_date(current: date, frequency: str, interval: int = 1, anchor_day: int | None = None) -> date:
    if frequency == "once":
        return current
    if frequency == "weekly":
        return current + timedelta(weeks=interval)
    if frequency == "biweekly":
        return current + timedelta(weeks=2 * interval)
    if frequency == "semi_monthly":
        this_month = month_start(current)
        next_month = add_months(this_month, 1)
        candidates = [this_month.replace(day=15), month_end(this_month), next_month.replace(day=15), month_end(next_month)]
        return next(c for c in candidates if (c - current).days >= 10)
    if frequency == "monthly":
        nxt = add_months(current, interval)
        if anchor_day:
            nxt = nxt.replace(day=min(anchor_day, month_end(nxt).day))
        return nxt
    if frequency in {"quarterly", "yearly"}:
        nxt = add_months(current, (3 if frequency == "quarterly" else 12) * interval)
        if anchor_day:
            nxt = nxt.replace(day=min(anchor_day, month_end(nxt).day))
        return nxt
    raise ValueError(f"Unknown frequency: {frequency}")


def occurrences_between(
    next_due_on: date,
    frequency: str,
    interval: int,
    start: date,
    end: date,
    end_on: date | None = None,
    anchor_day: int | None = None,
) -> list[date]:
    if frequency == "once":
        in_range = start <= next_due_on <= end and (end_on is None or next_due_on <= end_on)
        return [next_due_on] if in_range else []
    dates: list[date] = []
    current = next_due_on
    guard = 0
    while current <= end and guard < 500:
        if end_on and current > end_on:
            break
        if current >= start:
            dates.append(current)
        current = advance_due_date(current, frequency, interval, anchor_day)
        guard += 1
    return dates


MONTHLY_FACTORS = {
    "weekly": Decimal(52) / 12,
    "biweekly": Decimal(26) / 12,
    "semi_monthly": Decimal(2),
    "monthly": Decimal(1),
    "quarterly": Decimal(1) / 3,
    "yearly": Decimal(1) / 12,
    "once": Decimal(0),
}


def monthly_equivalent(amount_minor: int, frequency: str, interval: int = 1) -> int:
    return int((Decimal(amount_minor) * MONTHLY_FACTORS[frequency] / interval).to_integral_value())
