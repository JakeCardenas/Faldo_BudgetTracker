from datetime import date, timedelta

from app.engine.forecast import KnownEvent
from app.engine.periods import today_in
from app.engine.safe_to_spend import SafeToSpendInputs, compute_safe_to_spend, cycle_end, week_window

P = 100
WED = date(2026, 9, 23)  # a Wednesday


def run(balance: float, commitments: list[KnownEvent] | None = None, *, next_income: date | None = None,
        buffer: float = 0, card: float = 0, spent_week: float = 0, last_income: date | None = None,
        today: date = WED, currency: str = "PHP"):
    last_day, period = cycle_end(today, next_income)
    week_start, week_end = week_window(today, last_day, last_income)
    return compute_safe_to_spend(SafeToSpendInputs(
        today=today, currency=currency, spendable_balance_minor=round(balance * P), next_income_on=next_income,
        next_income_label="Salary" if next_income else None, commitments=commitments or [],
        card_owed_minor=round(card * P), buffer_minor=round(buffer * P), week_start=week_start, week_end=week_end,
        spent_this_week_minor=round(spent_week * P),
    ), last_day, period)


def bill(on: date, amount: float, label: str = "Bill", kind: str = "bill") -> KnownEvent:
    return KnownEvent(on, -round(amount * P), label, kind)


def test_cycle_ends_the_day_before_next_income():
    assert cycle_end(WED, WED + timedelta(days=10)) == (WED + timedelta(days=9), "until_income")
    assert cycle_end(WED, WED + timedelta(days=1)) == (WED, "until_income")


def test_no_income_or_far_income_uses_a_rolling_30_days():
    assert cycle_end(WED, None) == (WED + timedelta(days=29), "rolling")
    assert cycle_end(WED, WED + timedelta(days=60)) == (WED + timedelta(days=29), "rolling")
    assert cycle_end(WED, WED) == (WED + timedelta(days=29), "rolling")  # income due today isn't received yet


def test_brief_example_balance_bills_savings_buffer():
    result = run(24_850, [bill(WED + timedelta(days=3), 5_200), bill(WED + timedelta(days=1), 6_000, "Laptop", "savings")],
                 next_income=WED + timedelta(days=14), buffer=5_000)
    assert result.raw_minor == 8_650 * P
    assert result.amount_minor == 8_650 * P
    assert result.status == "good"
    assert [line["key"] for line in result.lines] == ["balance", "bills", "savings", "buffer"]
    assert result.lines[1]["items"][0]["amount_minor"] == 5_200 * P


def test_expected_income_is_never_spendable():
    # ₱2,000 on hand, rent of ₱8,000 due before a ₱20,000 salary arrives: the salary doesn't cover it.
    result = run(2_000, [bill(WED + timedelta(days=4), 8_000, "Rent")], next_income=WED + timedelta(days=14), buffer=1_000)
    assert result.raw_minor == -7_000 * P
    assert result.amount_minor == 0
    assert result.shortfall_minor == 7_000 * P
    assert result.status == "short"


def test_commitments_after_the_cycle_are_left_for_the_next_income():
    payday = WED + timedelta(days=7)
    result = run(10_000, [bill(WED + timedelta(days=2), 1_000), bill(payday, 3_000), bill(payday + timedelta(days=5), 4_000)],
                 next_income=payday)
    assert result.commitments_minor == 1_000 * P
    assert result.until == payday - timedelta(days=1)
    assert result.days_left == 7


def test_overdue_bills_are_still_set_aside():
    result = run(5_000, [bill(WED - timedelta(days=3), 1_500, "Internet")])
    assert result.commitments_minor == 1_500 * P
    assert result.lines[1]["items"][0]["is_overdue"] is True


def test_credit_card_and_money_owed_are_set_aside():
    result = run(10_000, [bill(WED + timedelta(days=5), 2_000, "Pay Mark", "debt")], card=3_000, buffer=500)
    assert result.raw_minor == (10_000 - 2_000 - 3_000 - 500) * P
    assert {line["key"] for line in result.lines} >= {"debts", "card"}


def test_zero_balance_and_no_income():
    result = run(0)
    assert result.amount_minor == 0
    assert result.per_day_minor == 0
    assert result.week["left_minor"] == 0
    assert result.period == "rolling"
    assert result.status == "tight"


def test_per_day_rounds_down_to_whole_pesos():
    result = run(1_000, next_income=WED + timedelta(days=3))
    assert result.days_left == 3
    assert result.per_day_minor == 333 * P


def test_week_allowance_spreads_money_across_the_cycle_and_drops_one_for_one_with_spending():
    # Cycle Mon Sep 21 .. Sun Oct 4 (14 days). Week window Mon..Sun = 7 days. Spent ₱1,000 so far this week.
    today, payday = date(2026, 9, 23), date(2026, 10, 5)
    result = run(6_000, next_income=payday, spent_week=1_000, today=today)
    # Money at the start of the week ≈ 6,000 + 1,000 = 7,000 → half of the 14-day cycle is this week = 3,500.
    assert result.week["allowance_minor"] == 3_500 * P
    assert result.week["left_minor"] == 2_500 * P
    more = run(5_500, next_income=payday, spent_week=1_500, today=today)
    assert more.week["left_minor"] == 2_000 * P  # another ₱500 spent → ₱500 less left this week


def test_week_restarts_when_money_comes_in():
    start, end = week_window(WED, WED + timedelta(days=20), WED - timedelta(days=1))
    assert start == WED - timedelta(days=1)
    assert end == date(2026, 9, 27)
    start, _ = week_window(WED, WED + timedelta(days=20), WED - timedelta(days=9))
    assert start == date(2026, 9, 21)


def test_week_is_cut_at_the_end_of_the_cycle():
    result = run(3_000, next_income=WED + timedelta(days=2))  # cycle ends Thursday
    assert result.week["end"] == (WED + timedelta(days=1)).isoformat()
    assert result.week["allowance_minor"] == result.amount_minor


def test_large_amounts_and_zero_decimal_currencies_stay_exact():
    big = run(9_999_999_999.99)
    assert big.amount_minor == 999_999_999_999
    yen = compute_safe_to_spend(SafeToSpendInputs(
        today=WED, currency="JPY", spendable_balance_minor=100_000, next_income_on=None, next_income_label=None,
        commitments=[], card_owed_minor=0, buffer_minor=0, week_start=WED, week_end=WED, spent_this_week_minor=0,
    ), *cycle_end(WED, None))
    assert yen.per_day_minor == 3_333


async def test_safe_to_spend_api_uses_received_money_until_next_income(client):
    today = today_in((await client.get("/api/v1/me")).json()["settings"]["timezone"])
    account = (await client.post("/api/v1/accounts", json={"name": "GCash", "type": "e_wallet", "opening_balance_minor": 10_000 * P})).json()
    await client.patch("/api/v1/me/settings", json={"safe_to_spend_buffer_minor": 500 * P})
    payday = today + timedelta(days=10)
    for body in (
        {"name": "Salary", "kind": "income", "amount_minor": 25_000 * P, "frequency": "monthly", "next_due_on": payday.isoformat(),
         "account_id": account["id"]},
        {"name": "Internet", "kind": "bill", "amount_minor": 1_500 * P, "frequency": "monthly",
         "next_due_on": (today + timedelta(days=3)).isoformat(), "account_id": account["id"]},
        {"name": "Rent", "kind": "rent", "amount_minor": 6_000 * P, "frequency": "monthly",
         "next_due_on": (payday + timedelta(days=2)).isoformat(), "account_id": account["id"]},
    ):
        assert (await client.post("/api/v1/recurring", json=body)).status_code == 201
    sts = (await client.get("/api/v1/dashboard")).json()["safe_to_spend"]
    assert sts["period"] == "until_income"
    assert sts["next_income_label"] == "Salary"
    assert sts["until"] == (payday - timedelta(days=1)).isoformat()
    assert sts["raw_minor"] == (10_000 - 1_500 - 500) * P  # salary not counted, rent after payday not counted
    assert sts["week"]["left_minor"] <= sts["amount_minor"]


def test_attention_lists_what_needs_acting_on_first():
    from types import SimpleNamespace

    from app.services.dashboard import attention_items

    today = WED
    sts = {"raw_minor": -500 * P, "shortfall_minor": 500 * P, "until": (today + timedelta(days=5)).isoformat()}
    upcoming = [
        {"is_overdue": True, "is_income": False, "name": "Internet", "amount_minor": 1_699 * P, "due_on": "2026-09-20",
         "recurring_payment_id": "r1", "account_id": "a1"},
        {"is_overdue": True, "is_income": True, "name": "Salary", "amount_minor": 20_000 * P, "due_on": "2026-09-15",
         "recurring_payment_id": "r2", "account_id": "a1"},
        {"is_overdue": False, "is_income": False, "name": "Rent", "amount_minor": 8_000 * P, "due_on": "2026-10-01",
         "recurring_payment_id": "r3", "account_id": "a1"},
    ]
    budget = [SimpleNamespace(status="over", category_name="Food", remaining_minor=-400 * P, pct_used=110.0, category_id="c1"),
              SimpleNamespace(status="on_track", category_name="Fun", remaining_minor=100 * P, pct_used=20.0, category_id="c2")]
    debts = [SimpleNamespace(status=SimpleNamespace(value="open"), due_on=today + timedelta(days=2), outstanding_minor=1_500 * P,
                             direction=SimpleNamespace(value="i_owe"), counterparty="Ate Joy", id="d1"),
             SimpleNamespace(status=SimpleNamespace(value="open"), due_on=today + timedelta(days=20), outstanding_minor=900 * P,
                             direction=SimpleNamespace(value="i_owe"), counterparty="Later", id="d2")]
    items = attention_items(today, sts, upcoming, budget, debts)
    assert [i["kind"] for i in items] == ["short", "bill_overdue", "owe_due", "budget_over", "income_unconfirmed"]
    assert all(i.get("title") != "Rent" and i.get("title") != "Later" for i in items)
