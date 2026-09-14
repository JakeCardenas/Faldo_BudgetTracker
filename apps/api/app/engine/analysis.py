import statistics
from typing import Any

from app.engine.money import percent, percent_change


def robust_z(value: float, history: list[float]) -> float | None:
    if len(history) < 8:
        return None
    median = statistics.median(history)
    mad = statistics.median(abs(x - median) for x in history)
    if mad == 0:
        return None
    return 0.6745 * (value - median) / mad


def compare_breakdowns(
    current: dict[str, int], previous: dict[str, int], labels: dict[str, str] | None = None
) -> dict[str, Any]:
    labels = labels or {}
    total_current = sum(current.values())
    total_previous = sum(previous.values())
    delta_total = total_current - total_previous
    keys = set(current) | set(previous)
    drivers: list[dict[str, Any]] = []
    for key in keys:
        cur, prev = current.get(key, 0), previous.get(key, 0)
        delta = cur - prev
        if delta == 0:
            continue
        drivers.append({
            "key": key,
            "label": labels.get(key, key),
            "current_minor": cur,
            "previous_minor": prev,
            "delta_minor": delta,
            "delta_pct": percent_change(cur, prev),
            "share_of_change_pct": percent(delta, delta_total) if delta_total else None,
        })
    drivers.sort(key=lambda d: abs(d["delta_minor"]), reverse=True)
    return {
        "current_total_minor": total_current,
        "previous_total_minor": total_previous,
        "delta_minor": delta_total,
        "delta_pct": percent_change(total_current, total_previous),
        "drivers": drivers,
    }


def share_rows(totals: dict[str, int], labels: dict[str, str], limit: int | None = None) -> list[dict[str, Any]]:
    grand = sum(totals.values())
    rows = [
        {"key": k, "label": labels.get(k, k), "amount_minor": v, "pct": percent(v, grand) or 0.0}
        for k, v in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return rows[:limit] if limit else rows


def percentile(values: list[int], pct: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    k = (len(ordered) - 1) * pct
    lo = int(k)
    hi = min(lo + 1, len(ordered) - 1)
    return round(ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo))
