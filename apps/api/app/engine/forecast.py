import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

RUNS = 400
MIN_WEEKDAY_SAMPLES = 4


@dataclass(frozen=True)
class KnownEvent:
    on: date
    amount_minor: int
    label: str
    kind: str
    ref_id: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "date": self.on.isoformat(),
            "amount_minor": self.amount_minor,
            "label": self.label,
            "kind": self.kind,
            "ref_id": self.ref_id,
        }


@dataclass
class ForecastResult:
    start_balance_minor: int
    horizon_end: date
    days: list[dict[str, Any]]
    end_p10_minor: int
    end_p50_minor: int
    end_p90_minor: int
    lowest_p50_minor: int
    lowest_p50_on: date
    expected_income_minor: int
    scheduled_outflows_minor: int
    projected_discretionary_minor: int
    history_days: int
    sufficiency: str
    events: list[KnownEvent] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "start_balance_minor": self.start_balance_minor,
            "horizon_end": self.horizon_end.isoformat(),
            "days": self.days,
            "end_balance": {"p10": self.end_p10_minor, "p50": self.end_p50_minor, "p90": self.end_p90_minor},
            "lowest_point": {"p50_minor": self.lowest_p50_minor, "date": self.lowest_p50_on.isoformat()},
            "expected_income_minor": self.expected_income_minor,
            "scheduled_outflows_minor": self.scheduled_outflows_minor,
            "projected_discretionary_minor": self.projected_discretionary_minor,
            "history_days": self.history_days,
            "sufficiency": self.sufficiency,
            "events": [e.as_dict() for e in self.events],
            "assumptions": self.assumptions,
        }


def _percentile(sorted_values: list[int], pct: float, step: int = 100) -> int:
    if not sorted_values:
        return 0
    k = (len(sorted_values) - 1) * pct
    lo = int(k)
    hi = min(lo + 1, len(sorted_values) - 1)
    value = sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (k - lo)
    return round(value / step) * step


def sufficiency_for(history_days: int) -> str:
    if history_days < 7:
        return "insufficient"
    if history_days < 21:
        return "low"
    return "ok"


def build_forecast(
    *,
    today: date,
    horizon_end: date,
    start_balance_minor: int,
    daily_discretionary: dict[date, int],
    history_days: int,
    events: list[KnownEvent],
    seed: int,
) -> ForecastResult:
    rng = random.Random(seed)
    by_weekday: dict[int, list[int]] = {i: [] for i in range(7)}
    all_samples: list[int] = []
    for day, amount in daily_discretionary.items():
        by_weekday[day.weekday()].append(amount)
        all_samples.append(amount)

    sufficiency = sufficiency_for(history_days)
    project_days = [today + timedelta(days=i) for i in range(1, (horizon_end - today).days + 1)]

    events_by_day: dict[date, int] = {}
    for ev in events:
        effective = max(ev.on, today + timedelta(days=1)) if ev.on <= today else ev.on
        if effective > horizon_end:
            continue
        events_by_day[effective] = events_by_day.get(effective, 0) + ev.amount_minor

    runs: list[list[int]] = []
    discretionary_totals: list[int] = []
    for _ in range(RUNS if all_samples else 1):
        balance = start_balance_minor
        path: list[int] = []
        spent = 0
        for day in project_days:
            pool = by_weekday[day.weekday()]
            if len(pool) < MIN_WEEKDAY_SAMPLES:
                pool = all_samples
            draw = rng.choice(pool) if pool else 0
            spent += draw
            balance += events_by_day.get(day, 0) - draw
            path.append(balance)
        runs.append(path)
        discretionary_totals.append(spent)

    days_out: list[dict[str, Any]] = [
        {"date": today.isoformat(), "p10": start_balance_minor, "p50": start_balance_minor, "p90": start_balance_minor,
         "event_minor": 0}
    ]
    lowest_value, lowest_on = start_balance_minor, today
    for idx, day in enumerate(project_days):
        values = sorted(run[idx] for run in runs)
        p50 = _percentile(values, 0.5)
        days_out.append({
            "date": day.isoformat(),
            "p10": _percentile(values, 0.1),
            "p50": p50,
            "p90": _percentile(values, 0.9),
            "event_minor": events_by_day.get(day, 0),
        })
        if p50 < lowest_value:
            lowest_value, lowest_on = p50, day

    end = days_out[-1]
    in_window = [e for e in events if e.on <= horizon_end]
    assumptions = [
        "Scheduled bills and income are applied on their due dates.",
        "Everyday spending is simulated from your recent daily spending on the same weekday.",
        "Unusually large one-off purchases are excluded from the spending pattern.",
    ]
    if sufficiency != "ok":
        assumptions.append("There is limited history, so the range is less reliable.")

    return ForecastResult(
        start_balance_minor=start_balance_minor,
        horizon_end=horizon_end,
        days=days_out,
        end_p10_minor=end["p10"],
        end_p50_minor=end["p50"],
        end_p90_minor=end["p90"],
        lowest_p50_minor=lowest_value,
        lowest_p50_on=lowest_on,
        expected_income_minor=sum(e.amount_minor for e in in_window if e.amount_minor > 0),
        scheduled_outflows_minor=-sum(e.amount_minor for e in in_window if e.amount_minor < 0),
        projected_discretionary_minor=_percentile(sorted(discretionary_totals), 0.5),
        history_days=history_days,
        sufficiency=sufficiency,
        events=sorted(in_window, key=lambda e: e.on),
        assumptions=assumptions,
    )
