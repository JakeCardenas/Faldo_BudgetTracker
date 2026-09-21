"""Safe to Spend: money you already have that isn't spoken for before your next income.

Only received money counts. Expected income is never added; it only decides how long the money has to last
(the cycle ends the day before the next scheduled income). Without a regular income the cycle is a rolling 30 days.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Literal

from app.engine.forecast import KnownEvent
from app.engine.money import minor_factor

MAX_CYCLE_DAYS = 35
ROLLING_DAYS = 30

PeriodKind = Literal["until_income", "rolling"]
Status = Literal["good", "tight", "short"]


def cycle_end(today: date, next_income_on: date | None) -> tuple[date, PeriodKind]:
    """Last day the money on hand has to cover."""
    if next_income_on and today < next_income_on <= today + timedelta(days=MAX_CYCLE_DAYS):
        return next_income_on - timedelta(days=1), "until_income"
    return today + timedelta(days=ROLLING_DAYS - 1), "rolling"


def week_window(today: date, cycle_last_day: date, last_income_on: date | None) -> tuple[date, date]:
    """This week's spending window: Monday (or the day money last came in) to Sunday, inside the cycle."""
    monday = today - timedelta(days=today.weekday())
    start = max(monday, last_income_on) if last_income_on and last_income_on <= today else monday
    end = min(monday + timedelta(days=6), cycle_last_day)
    return start, max(end, today)


@dataclass(frozen=True)
class PlanWeek:
    """What the Money Plan sets aside per pay period for needs and Joy Money, and what was spent this week."""

    joy_per_period_minor: int
    needs_per_period_minor: int
    period_days: Decimal
    joy_spent_minor: int
    needs_spent_minor: int


@dataclass(frozen=True)
class SafeToSpendInputs:
    today: date
    currency: str
    spendable_balance_minor: int
    next_income_on: date | None
    next_income_label: str | None
    commitments: list[KnownEvent]
    card_owed_minor: int
    buffer_minor: int
    week_start: date
    week_end: date
    spent_this_week_minor: int
    plan: PlanWeek | None = None


@dataclass
class SafeToSpendResult:
    amount_minor: int
    raw_minor: int
    per_day_minor: int
    days_left: int
    until: date
    period: PeriodKind
    next_income_on: date | None
    next_income_label: str | None
    status: Status
    lines: list[dict[str, Any]]
    commitments_minor: int
    buffer_minor: int
    week: dict[str, Any]
    note: str
    shortfall_minor: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "amount_minor": self.amount_minor,
            "raw_minor": self.raw_minor,
            "per_day_minor": self.per_day_minor,
            "days_left": self.days_left,
            "until": self.until.isoformat(),
            "period": self.period,
            "next_income_on": self.next_income_on.isoformat() if self.next_income_on else None,
            "next_income_label": self.next_income_label,
            "status": self.status,
            "lines": self.lines,
            "commitments_minor": self.commitments_minor,
            "buffer_minor": self.buffer_minor,
            "shortfall_minor": self.shortfall_minor,
            "week": self.week,
            "note": self.note,
        }


def _floor_to_unit(amount_minor: int, currency: str) -> int:
    unit = minor_factor(currency)
    return (amount_minor // unit) * unit if amount_minor >= 0 else -((-amount_minor + unit - 1) // unit) * unit


def _item(event: KnownEvent, today: date) -> dict[str, Any]:
    return {"label": event.label, "amount_minor": -event.amount_minor, "date": event.on.isoformat(),
            "is_overdue": event.on < today, "kind": event.kind, "ref_id": event.ref_id}


def compute_safe_to_spend(inputs: SafeToSpendInputs, cycle_last_day: date, period: PeriodKind) -> SafeToSpendResult:
    today = inputs.today
    due = sorted((e for e in inputs.commitments if e.amount_minor < 0 and e.on <= cycle_last_day), key=lambda e: e.on)
    groups: dict[str, list[KnownEvent]] = {"bill": [], "debt": [], "savings": []}
    for event in due:
        groups[event.kind if event.kind in groups else "bill"].append(event)
    totals = {kind: -sum(e.amount_minor for e in events) for kind, events in groups.items()}

    until_label = "before your next income" if period == "until_income" else "in the next 30 days"
    lines: list[dict[str, Any]] = [
        {"key": "balance", "label": "Money you have now", "amount_minor": inputs.spendable_balance_minor, "op": "start",
         "hint": "Cash, e-wallets and bank accounts marked spendable. Expected income isn't counted."},
        {"key": "bills", "label": f"Bills and subscriptions {until_label}", "amount_minor": totals["bill"], "op": "subtract",
         "items": [_item(e, today) for e in groups["bill"]]},
    ]
    if totals["debt"]:
        lines.append({"key": "debts", "label": f"Money you owe that's due {until_label}", "amount_minor": totals["debt"],
                      "op": "subtract", "items": [_item(e, today) for e in groups["debt"]]})
    lines.append({"key": "savings", "label": "Planned savings for your goals", "amount_minor": totals["savings"],
                  "op": "subtract", "items": [_item(e, today) for e in groups["savings"]]})
    if inputs.card_owed_minor:
        lines.append({"key": "card", "label": "Credit card balance to pay", "amount_minor": inputs.card_owed_minor,
                      "op": "subtract"})
    lines.append({"key": "buffer", "label": "Safety buffer", "amount_minor": inputs.buffer_minor, "op": "subtract",
                  "hint": "Kept aside for surprises. Change it in Settings."})

    commitments = totals["bill"] + totals["debt"] + totals["savings"] + inputs.card_owed_minor
    raw = inputs.spendable_balance_minor - commitments - inputs.buffer_minor
    amount = max(0, raw)
    days_left = (cycle_last_day - today).days + 1
    per_day = _floor_to_unit(amount // days_left, inputs.currency)

    week_start, week_end = inputs.week_start, min(inputs.week_end, cycle_last_day)
    spent = max(0, inputs.spent_this_week_minor)
    week_days = max(1, (week_end - week_start).days + 1)
    cycle_days_from_week_start = max(week_days, (cycle_last_day - week_start).days + 1)
    base = max(0, raw + spent)
    allowance = _floor_to_unit(base * week_days // cycle_days_from_week_start, inputs.currency)
    week_left = max(0, allowance - spent)
    week: dict[str, Any] = {"start": week_start.isoformat(), "end": week_end.isoformat(), "allowance_minor": allowance,
                            "spent_minor": spent, "left_minor": week_left, "days_left": (week_end - today).days + 1,
                            "plan": None}
    if inputs.plan is not None:
        # The Money Plan can only make the week stricter: it never lets you spend money you don't have.
        plan = inputs.plan
        joy = _floor_to_unit(int(Decimal(plan.joy_per_period_minor) * week_days / plan.period_days), inputs.currency)
        needs = _floor_to_unit(int(Decimal(plan.needs_per_period_minor) * week_days / plan.period_days), inputs.currency)
        joy_left, needs_left = max(0, joy - plan.joy_spent_minor), max(0, needs - plan.needs_spent_minor)
        week["plan"] = {"joy_allowance_minor": joy, "joy_spent_minor": plan.joy_spent_minor, "joy_left_minor": joy_left,
                        "needs_allowance_minor": needs, "needs_spent_minor": plan.needs_spent_minor,
                        "needs_left_minor": needs_left, "limited_by": "plan" if joy_left + needs_left < week_left else "money"}
        if joy_left + needs_left < week_left:
            # The plan is the tighter limit, so the bar shows the plan's week.
            week.update(allowance_minor=joy + needs, spent_minor=plan.joy_spent_minor + plan.needs_spent_minor)
        week_left = min(week_left, joy_left + needs_left)
        week["left_minor"] = week_left

    status: Status = "short" if raw < 0 else ("tight" if week_left == 0 else "good")
    note = ("Only money you've already received counts. Bills, savings and money you owe due "
            + ("before your next income" if period == "until_income" else "in the next 30 days")
            + " are set aside, plus your safety buffer.")
    return SafeToSpendResult(
        amount_minor=amount, raw_minor=raw, per_day_minor=per_day, days_left=days_left, until=cycle_last_day,
        period=period, next_income_on=inputs.next_income_on if period == "until_income" else None,
        next_income_label=inputs.next_income_label if period == "until_income" else None,
        status=status, lines=lines, commitments_minor=commitments, buffer_minor=inputs.buffer_minor,
        shortfall_minor=-raw if raw < 0 else 0, week=week, note=note,
    )
