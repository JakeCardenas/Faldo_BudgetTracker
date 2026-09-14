import statistics
from dataclasses import dataclass
from typing import Any

FORMULA_VERSION = "v1"


@dataclass(frozen=True)
class HealthInputs:
    history_days: int
    monthly_income_minor: list[int]
    monthly_expense_minor: list[int]
    monthly_discretionary_minor: list[int]
    budgeted_limit_minor: int
    budgeted_within_minor: int
    spendable_balance_minor: int
    avg_monthly_essential_minor: int
    recurring_monthly_obligations_minor: int
    goal_actual_vs_required: list[float]


def _linear(value: float, zero_at: float, full_at: float) -> float:
    if full_at == zero_at:
        return 100.0
    score = (value - zero_at) / (full_at - zero_at) * 100
    return max(0.0, min(100.0, score))


def financial_health(inputs: HealthInputs) -> dict[str, Any]:
    components: list[dict[str, Any]] = []
    income_total = sum(inputs.monthly_income_minor)
    expense_total = sum(inputs.monthly_expense_minor)
    months = len(inputs.monthly_income_minor)
    avg_income = income_total / months if months else 0

    def add(key: str, label: str, weight: float, value: float | None, score: float | None,
            explanation: str, measure: str) -> None:
        components.append({
            "key": key,
            "label": label,
            "weight": weight,
            "value": value,
            "score": round(score) if score is not None else None,
            "counted": score is not None,
            "measure": measure,
            "explanation": explanation,
        })

    if income_total > 0:
        rate = (income_total - expense_total) / income_total
        add("savings_rate", "Savings rate", 0.25, round(rate * 100, 1), _linear(rate, 0.0, 0.20),
            "Share of income left after expenses over recent months. 20% or more scores 100.",
            "(income − expenses) ÷ income")
    else:
        add("savings_rate", "Savings rate", 0.25, None, None, "No income recorded yet.", "(income − expenses) ÷ income")

    if inputs.budgeted_limit_minor > 0:
        adherence = inputs.budgeted_within_minor / inputs.budgeted_limit_minor
        add("budget_adherence", "Budget adherence", 0.20, round(adherence * 100, 1), _linear(adherence, 0.5, 1.0),
            "How much of your budgeted spending stayed within its limits. 100% scores 100, 50% or less scores 0.",
            "within-budget spending ÷ budgeted spending")
    else:
        add("budget_adherence", "Budget adherence", 0.20, None, None, "No budgets set in recent months.",
            "within-budget spending ÷ budgeted spending")

    if inputs.avg_monthly_essential_minor > 0:
        months_cover = inputs.spendable_balance_minor / inputs.avg_monthly_essential_minor
        add("cash_buffer", "Cash buffer", 0.20, round(months_cover, 2), _linear(months_cover, 0, 3),
            "Months of essential spending your spendable balance could cover. 3 months or more scores 100.",
            "spendable balance ÷ average monthly essential spending")
    else:
        add("cash_buffer", "Cash buffer", 0.20, None, None, "Not enough essential spending history.",
            "spendable balance ÷ average monthly essential spending")

    if avg_income > 0:
        ratio = inputs.recurring_monthly_obligations_minor / avg_income
        add("fixed_obligations", "Fixed obligations", 0.15, round(ratio * 100, 1), _linear(ratio, 0.70, 0.30),
            "Recurring bills as a share of income. 30% or less scores 100, 70% or more scores 0.",
            "monthly recurring bills ÷ average monthly income")
    else:
        add("fixed_obligations", "Fixed obligations", 0.15, None, None, "No income recorded yet.",
            "monthly recurring bills ÷ average monthly income")

    disc = [m for m in inputs.monthly_discretionary_minor if m > 0]
    if len(disc) >= 3:
        mean = statistics.mean(disc)
        cv = statistics.pstdev(disc) / mean if mean else 0
        add("spending_stability", "Spending stability", 0.10, round(cv, 2), _linear(cv, 0.5, 0.1),
            "How much your everyday spending changes month to month. Lower variation scores higher.",
            "standard deviation ÷ mean of monthly everyday spending")
    else:
        add("spending_stability", "Spending stability", 0.10, None, None, "Needs at least 3 months of spending.",
            "standard deviation ÷ mean of monthly everyday spending")

    if inputs.goal_actual_vs_required:
        avg = sum(min(1.0, r) for r in inputs.goal_actual_vs_required) / len(inputs.goal_actual_vs_required)
        add("goal_progress", "Goal progress", 0.10, round(avg * 100, 1), avg * 100,
            "Average of your actual goal contributions compared with what each goal needs.",
            "actual monthly contributions ÷ required monthly contributions")
    else:
        add("goal_progress", "Goal progress", 0.10, None, None, "No active goals with target dates.",
            "actual monthly contributions ÷ required monthly contributions")

    counted = [c for c in components if c["counted"]]
    eligible = inputs.history_days >= 60 and len(counted) >= 3
    total_weight = sum(c["weight"] for c in counted)
    score = None
    if eligible and total_weight > 0:
        for c in counted:
            c["effective_weight"] = round(c["weight"] / total_weight, 3)
        score = round(sum(c["score"] * c["weight"] for c in counted) / total_weight)

    label = None
    if score is not None:
        label = "Steady" if score >= 70 else "Building" if score >= 40 else "Needs attention"

    return {
        "formula_version": FORMULA_VERSION,
        "score": score,
        "label": label,
        "eligible": eligible,
        "history_days": inputs.history_days,
        "components": components,
        "disclaimer": (
            "This is a simple summary of six habits calculated from your Faldo data. It is not a credit score "
            "or a professional financial assessment."
        ),
    }
