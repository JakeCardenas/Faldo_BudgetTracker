from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.ai.guardrails.numeric import check_numbers
from app.ai.guardrails.output import sanitize_markdown, strip_unknown_refs
from app.engine.analysis import compare_breakdowns, robust_z
from app.engine.calculator import CalculationError, evaluate
from app.engine.forecast import KnownEvent, build_forecast
from app.engine.health import HealthInputs, financial_health
from app.engine.money import format_money, parse_amount_text, percent_change, to_minor
from app.engine.periods import add_months, previous_comparable, resolve_period
from app.engine.planning import (
    advance_due_date,
    budget_line_status,
    goal_progress,
    monthly_equivalent,
    occurrences_between,
)
from app.engine.scenarios import Adjustment, run_scenario, total_from_lines


def test_money_is_exact():
    assert to_minor("0.1") + to_minor("0.2") == to_minor("0.3")
    assert to_minor(Decimal("1234.565")) == 123457
    assert format_money(1658000) == "₱16,580"
    assert format_money(-35050) == "−₱350.50"
    assert format_money(35000, signed=True) == "+₱350"
    assert parse_amount_text("Salary ₱30,000") == 3_000_000
    assert parse_amount_text("sweldo 15k") == 1_500_000
    assert percent_change(90, 100) == -10.0
    assert percent_change(10, 0) is None


def test_periods():
    today = date(2026, 3, 31)
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    last = resolve_period("last_month", today)
    assert (last.start, last.end) == (date(2026, 2, 1), date(2026, 2, 28))
    this = resolve_period("this_month", date(2026, 9, 14))
    prev = previous_comparable(this)
    assert (prev.start, prev.end) == (date(2026, 8, 1), date(2026, 8, 14))
    with pytest.raises(ValueError):
        resolve_period("custom", today)


def test_budget_status_pacing():
    month = date(2026, 9, 1)
    on_track = budget_line_status(500_000, 200_000, date(2026, 9, 15), month)
    assert on_track.status == "on_track" and on_track.remaining_minor == 300_000
    at_risk = budget_line_status(500_000, 425_000, date(2026, 9, 10), month)
    assert at_risk.status == "at_risk" and at_risk.pct_used == 85.0
    over = budget_line_status(500_000, 510_000, date(2026, 9, 20), month)
    assert over.status == "over" and over.remaining_minor == -10_000


def test_goal_progress_projection():
    today = date(2026, 9, 14)
    progress = goal_progress(target_minor=7_500_000, saved_minor=4_100_000, today=today, target_date=date(2027, 3, 31),
                             planned_monthly_minor=600_000, average_monthly_minor=600_000)
    assert progress.remaining_minor == 3_400_000
    assert progress.pct_complete == 54.7
    assert progress.required_monthly_minor is not None and progress.required_monthly_minor > 0
    assert progress.projected_completion_on is not None and progress.on_track is True
    behind = goal_progress(target_minor=6_000_000, saved_minor=800_000, today=today, target_date=date(2027, 4, 15),
                           planned_monthly_minor=None, average_monthly_minor=200_000)
    assert behind.on_track is False


def test_recurring_dates():
    assert advance_due_date(date(2026, 1, 31), "monthly") == date(2026, 2, 28)
    assert advance_due_date(date(2026, 2, 28), "monthly", anchor_day=31) == date(2026, 3, 31)
    assert advance_due_date(date(2026, 3, 31), "monthly", anchor_day=31) == date(2026, 4, 30)
    assert advance_due_date(date(2026, 9, 1), "semi_monthly") == date(2026, 9, 15)
    assert advance_due_date(date(2026, 9, 14), "semi_monthly") == date(2026, 9, 30)
    assert advance_due_date(date(2026, 9, 15), "semi_monthly") == date(2026, 9, 30)
    assert advance_due_date(date(2026, 9, 30), "semi_monthly") == date(2026, 10, 15)
    assert len(occurrences_between(date(2026, 9, 5), "weekly", 1, date(2026, 9, 1), date(2026, 9, 30))) == 4
    assert monthly_equivalent(1_200_000, "yearly") == 100_000


def _history(days: int, amount: int, today: date) -> dict[date, int]:
    return {today - timedelta(days=i): amount for i in range(1, days + 1)}


def test_forecast_is_deterministic_and_respects_events():
    today = date(2026, 9, 14)
    history = _history(60, 50_000, today)
    events = [KnownEvent(date(2026, 9, 20), -200_000, "Meralco", "bill"), KnownEvent(date(2026, 9, 30), 2_400_000, "Salary", "income")]
    a = build_forecast(today=today, horizon_end=date(2026, 9, 30), start_balance_minor=1_000_000,
                       daily_discretionary=history, history_days=60, events=events, seed=7)
    b = build_forecast(today=today, horizon_end=date(2026, 9, 30), start_balance_minor=1_000_000,
                       daily_discretionary=history, history_days=60, events=events, seed=7)
    assert a.days == b.days
    assert a.end_p50_minor == 1_000_000 - 200_000 + 2_400_000 - 16 * 50_000
    assert a.expected_income_minor == 2_400_000 and a.scheduled_outflows_minor == 200_000
    assert a.sufficiency == "ok"


def test_scenario_lines_add_up_and_expense_lowers_balance():
    today = date(2026, 9, 14)
    result = run_scenario(
        today=today, horizon_end=date(2026, 9, 30), start_balance_minor=2_485_000,
        daily_discretionary=_history(45, 40_000, today), history_days=45,
        events=[KnownEvent(date(2026, 9, 20), -520_000, "Bills", "bill"), KnownEvent(date(2026, 9, 15), -700_000, "Goal", "savings")],
        adjustments=[Adjustment("one_time_expense", 300_000, date(2026, 9, 15), "Headphones")],
        planned_savings_minor=700_000, buffer_minor=200_000, seed=1,
    )
    assert total_from_lines(result["lines"]) == result["projected_minor"]
    assert result["delta_minor"] == -300_000
    assert result["risk_level"] in {"low", "medium", "high"}
    big = run_scenario(
        today=today, horizon_end=date(2026, 9, 30), start_balance_minor=500_000,
        daily_discretionary=_history(45, 40_000, today), history_days=45, events=[], adjustments=[
            Adjustment("one_time_expense", 5_000_000, date(2026, 9, 15), "Phone")],
        planned_savings_minor=0, buffer_minor=200_000, seed=1,
    )
    assert big["risk_level"] == "high" and big["verdict"] == "not_recommended"


def test_calculator_is_safe():
    assert evaluate("35000 - 18420") == Decimal("16580.0000")
    assert evaluate("(10 + 5) / 4") == Decimal("3.7500")
    for bad in ("__import__('os')", "2 ** 10", "open('x')", "1 / 0"):
        with pytest.raises(CalculationError):
            evaluate(bad)


def test_health_score_is_transparent():
    result = financial_health(HealthInputs(
        history_days=180, monthly_income_minor=[4_800_000] * 3, monthly_expense_minor=[4_000_000] * 3,
        monthly_discretionary_minor=[1_500_000, 1_600_000, 1_400_000, 1_550_000, 1_500_000, 1_450_000],
        budgeted_limit_minor=10_000_000, budgeted_within_minor=9_000_000, spendable_balance_minor=3_500_000,
        avg_monthly_essential_minor=2_000_000, recurring_monthly_obligations_minor=1_500_000, goal_actual_vs_required=[1.0, 0.5],
    ))
    assert result["eligible"] and 0 <= result["score"] <= 100
    assert all("explanation" in c and "measure" in c for c in result["components"])
    new_user = financial_health(HealthInputs(10, [], [], [], 0, 0, 0, 0, 0, []))
    assert new_user["score"] is None


def test_analysis_helpers():
    assert robust_z(10_000, [100, 120, 110, 90, 105, 95, 115, 100]) > 3.5
    assert robust_z(10_000, [100, 120]) is None
    result = compare_breakdowns({"food": 500, "transport": 100}, {"food": 300, "transport": 150}, {"food": "Food"})
    assert result["delta_minor"] == 150 and result["drivers"][0]["label"] == "Food"


def test_numeric_validator_blocks_invented_numbers():
    tools = [{"total": "₱16,580", "total_minor": 1_658_000, "change_pct": -8.2}]
    assert check_numbers("You spent ₱16,580, 8.2% less than last month.", tools, "").ok
    assert check_numbers("You spent about ₱16,600.", tools, "").ok
    bad = check_numbers("You spent ₱18,420 which is 12% more.", tools, "")
    assert not bad.ok and bad.unsupported_amounts and bad.unsupported_percents
    assert check_numbers("A ₱3,000 purchase would be fine.", [], "Can I afford ₱3,000?").ok


def test_output_sanitizer():
    text = "See ![x](https://evil.test/p.png) and [click](https://evil.test) <script>x</script> [t1] [t9]"
    clean = strip_unknown_refs(sanitize_markdown(text), {"t1"})
    assert "evil" not in clean and "<script>" not in clean and "[t1]" in clean and "[t9]" not in clean


def test_repeating_what_if_changes():
    from app.engine.scenarios import adjustment_total, occurrences

    start = date(2026, 9, 15)
    daily = Adjustment("one_time_expense", 20_000, start, "Food", repeat="daily")
    assert len(occurrences(daily, date(2026, 9, 30))) == 16
    assert adjustment_total(daily, date(2026, 9, 30)) == 320_000
    weekly = Adjustment("one_time_expense", 50_000, start, "Eating out", repeat="weekly")
    assert occurrences(weekly, date(2026, 10, 6)) == [date(2026, 9, 15), date(2026, 9, 22), date(2026, 9, 29), date(2026, 10, 6)]
    monthly = Adjustment("extra_savings", 200_000, date(2026, 1, 31), "Save more", repeat="monthly")
    assert occurrences(monthly, date(2026, 4, 30)) == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)]

    today = date(2026, 9, 14)
    kwargs = dict(today=today, horizon_end=date(2027, 3, 14), start_balance_minor=5_000_000,
                  daily_discretionary=_history(45, 40_000, today), history_days=45, events=[],
                  planned_savings_minor=0, buffer_minor=200_000, seed=3)
    drop = run_scenario(adjustments=[Adjustment("income_decrease", 500_000, start, "Less income", repeat="monthly")], **kwargs)
    assert drop["delta_minor"] == -500_000 * 6  # Sep 15 .. Feb 15; Mar 15 is after the horizon
    line = drop["lines"][-1]
    assert line["times"] == 6 and line["each_minor"] == 500_000 and line["amount_minor"] == 3_000_000
    assert total_from_lines(drop["lines"]) == drop["projected_minor"]
    save = run_scenario(adjustments=[Adjustment("extra_savings", 200_000, start, "Save", repeat="monthly")], **kwargs)
    assert save["delta_minor"] == -1_200_000
