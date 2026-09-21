from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from app.engine.forecast import ForecastResult, KnownEvent, build_forecast
from app.engine.periods import add_months
from app.engine.planning import goal_delay_days

INFLOW_KINDS = {"one_time_income", "reduce_savings"}
OUTFLOW_KINDS = {"one_time_expense", "extra_savings", "income_decrease"}
SPENDING_KINDS = {"one_time_expense", "income_decrease"}
REPEATS = ("once", "daily", "weekly", "monthly")


@dataclass(frozen=True)
class Adjustment:
    kind: str
    amount_minor: int
    on: date
    label: str
    category_id: str | None = None
    repeat: str = "once"


RISK_VERDICT = {"low": "comfortable", "medium": "tight", "high": "not_recommended"}


def occurrences(adj: Adjustment, horizon_end: date) -> list[date]:
    """Dates an adjustment happens on, from its first date through the horizon."""
    if adj.repeat == "once":
        return [adj.on] if adj.on <= horizon_end else []
    dates: list[date] = []
    step = 0
    current = adj.on
    while current <= horizon_end and step < 400:
        dates.append(current)
        step += 1
        if adj.repeat == "daily":
            current = adj.on + timedelta(days=step)
        elif adj.repeat == "weekly":
            current = adj.on + timedelta(weeks=step)
        else:
            current = add_months(adj.on, step)
    return dates


def adjustments_to_events(adjustments: list[Adjustment], horizon_end: date | None = None) -> list[KnownEvent]:
    events: list[KnownEvent] = []
    for adj in adjustments:
        sign = 1 if adj.kind in INFLOW_KINDS else -1
        for on in occurrences(adj, horizon_end or adj.on):
            events.append(KnownEvent(on=on, amount_minor=sign * adj.amount_minor, label=adj.label, kind=adj.kind))
    return events


def adjustment_total(adj: Adjustment, horizon_end: date) -> int:
    return adj.amount_minor * len(occurrences(adj, horizon_end))


def calculation_lines(forecast: ForecastResult, planned_savings_minor: int, adjustments: list[Adjustment]) -> list[dict[str, Any]]:
    savings_events = sum(-e.amount_minor for e in forecast.events if e.kind == "savings")
    bills = forecast.scheduled_outflows_minor - savings_events
    lines: list[dict[str, Any]] = [
        {"key": "balance", "label": "Spendable balance now", "amount_minor": forecast.start_balance_minor, "op": "start"},
        {"key": "income", "label": "Expected income", "amount_minor": forecast.expected_income_minor, "op": "add"},
        {"key": "bills", "label": "Upcoming bills & recurring", "amount_minor": bills, "op": "subtract"},
        {"key": "savings", "label": "Planned savings", "amount_minor": planned_savings_minor, "op": "subtract"},
        {"key": "everyday", "label": "Typical everyday spending", "amount_minor": forecast.projected_discretionary_minor,
         "op": "subtract"},
    ]
    for adj in adjustments:
        op = "add" if adj.kind in INFLOW_KINDS else "subtract"
        times = len(occurrences(adj, forecast.horizon_end))
        label = adj.label if adj.repeat == "once" else f"{adj.label} ({adj.repeat}, ×{times})"
        lines.append({"key": adj.kind, "label": label, "amount_minor": adj.amount_minor * times, "op": op,
                      "repeat": adj.repeat, "times": times, "each_minor": adj.amount_minor})
    return lines


def total_from_lines(lines: list[dict[str, Any]]) -> int:
    total = 0
    for line in lines:
        if line["op"] in {"start", "add"}:
            total += line["amount_minor"]
        else:
            total -= line["amount_minor"]
    return total


def assess_risk(
    *,
    projected_minor: int,
    scenario: ForecastResult,
    buffer_minor: int,
    budget_over: bool,
) -> tuple[str, list[dict[str, Any]]]:
    reasons: list[dict[str, Any]] = []
    level = "low"
    if projected_minor < 0 or scenario.lowest_p50_minor < 0:
        level = "high"
        reasons.append({"code": "negative_balance", "lowest_minor": min(projected_minor, scenario.lowest_p50_minor),
                        "date": scenario.lowest_p50_on.isoformat()})
    if projected_minor < buffer_minor:
        if level == "low":
            level = "medium"
        reasons.append({"code": "below_buffer", "buffer_minor": buffer_minor, "projected_minor": projected_minor})
    if scenario.end_p10_minor < 0 and level == "low":
        level = "medium"
        reasons.append({"code": "downside_negative", "p10_minor": scenario.end_p10_minor})
    if budget_over:
        if level == "low":
            level = "medium"
        reasons.append({"code": "budget_exceeded"})
    if scenario.sufficiency != "ok":
        reasons.append({"code": "limited_history", "history_days": scenario.history_days})
    return level, reasons


def run_scenario(
    *,
    today: date,
    horizon_end: date,
    start_balance_minor: int,
    daily_discretionary: dict[date, int],
    history_days: int,
    events: list[KnownEvent],
    adjustments: list[Adjustment],
    planned_savings_minor: int,
    buffer_minor: int,
    seed: int,
    budget_over: bool = False,
    goal_pace_minor: int | None = None,
) -> dict[str, Any]:
    baseline = build_forecast(
        today=today, horizon_end=horizon_end, start_balance_minor=start_balance_minor,
        daily_discretionary=daily_discretionary, history_days=history_days, events=events, seed=seed,
    )
    scenario = build_forecast(
        today=today, horizon_end=horizon_end, start_balance_minor=start_balance_minor,
        daily_discretionary=daily_discretionary, history_days=history_days,
        events=events + adjustments_to_events(adjustments, horizon_end), seed=seed,
    )
    baseline_lines = calculation_lines(baseline, planned_savings_minor, [])
    lines = calculation_lines(baseline, planned_savings_minor, adjustments)
    baseline_projected = total_from_lines(baseline_lines)
    projected = total_from_lines(lines)
    level, reasons = assess_risk(
        projected_minor=projected, scenario=scenario, buffer_minor=buffer_minor, budget_over=budget_over
    )
    spend = sum(adjustment_total(a, horizon_end) for a in adjustments if a.kind in SPENDING_KINDS)
    savings_at_risk = min(planned_savings_minor, max(0, -projected))
    return {
        "horizon_end": horizon_end.isoformat(),
        "lines": lines,
        "projected_minor": projected,
        "baseline_projected_minor": baseline_projected,
        "delta_minor": projected - baseline_projected,
        "risk_level": level,
        "verdict": RISK_VERDICT[level],
        "reasons": reasons,
        "savings_at_risk_minor": savings_at_risk,
        "goal_delay_days": goal_delay_days(spend, goal_pace_minor) if goal_pace_minor and spend else None,
        "range": {"p10": scenario.end_p10_minor, "p50": scenario.end_p50_minor, "p90": scenario.end_p90_minor},
        "baseline_series": [{"date": d["date"], "p50": d["p50"]} for d in baseline.days],
        "scenario_series": [{"date": d["date"], "p10": d["p10"], "p50": d["p50"], "p90": d["p90"]} for d in scenario.days],
        "sufficiency": scenario.sufficiency,
        "buffer_minor": buffer_minor,
    }
