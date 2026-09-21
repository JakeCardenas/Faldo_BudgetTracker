from datetime import date, timedelta
from decimal import Decimal

from app.engine.money_plan import PERIOD_DAYS, PlanInputs, allocate, per_period, share_of, template_60_20_20
from app.engine.periods import today_in
from app.engine.safe_to_spend import PlanWeek, SafeToSpendInputs, compute_safe_to_spend, cycle_end, week_window
from tests.test_ai import ask

P = 100
TODAY = today_in("Asia/Manila")


def plan(**kw):  # type: ignore[no-untyped-def]
    base = dict(currency="PHP", income_minor=20_000 * P, commitments_minor=6_274 * P, goal_savings_minor=3_000 * P,
                savings_minor=4_000 * P, joy_minor=2_000 * P, buffer_minor=0)
    return allocate(PlanInputs(**{**base, **kw}))


def test_needs_get_what_is_left_by_default():
    a = plan()
    assert a["needs_minor"] == 7_726 * P and a["unassigned_minor"] == 0 and a["warnings"] == []
    assert [b["key"] for b in a["buckets"]] == ["commitments", "needs", "joy", "savings", "buffer"]
    assert next(b for b in a["buckets"] if b["key"] == "joy")["pct"] == 10.0


def test_user_set_needs_leave_money_unassigned_or_over_assigned():
    assert plan(needs_minor=5_000 * P)["unassigned_minor"] == 2_726 * P
    over = plan(needs_minor=9_000 * P)
    assert over["unassigned_minor"] == -1_274 * P
    assert {"code": "over_assigned", "amount_minor": 1_274 * P} in over["warnings"]
    assert {"code": "savings_below_goals", "amount_minor": 1_000 * P} in plan(savings_minor=2_000 * P)["warnings"]
    broke = plan(income_minor=5_000 * P, savings_minor=0, joy_minor=0)
    assert broke["needs_minor"] == 0 and any(w["code"] == "bills_exceed_income" for w in broke["warnings"])


def test_60_20_20_is_a_starting_point_that_includes_bills_in_needs():
    t = template_60_20_20(20_000 * P, 6_000 * P, "PHP")
    assert (t["savings_minor"], t["joy_minor"], t["needs_minor"]) == (4_000 * P, 4_000 * P, 6_000 * P)
    heavy = template_60_20_20(20_000 * P, 13_000 * P, "PHP")
    assert heavy["needs_minor"] == 0 and heavy["bills_over_needs_share_minor"] == 1_000 * P
    odd = template_60_20_20(15_555 * P + 55, 0, "PHP")
    assert odd["savings_minor"] == 3_111 * P  # rounded down to whole pesos


def test_monthly_amounts_per_payday_and_weekly_shares():
    assert per_period(12_548 * P, PERIOD_DAYS["semi_monthly"], "PHP") == 6_274 * P
    assert per_period(3_000 * P, PERIOD_DAYS["weekly"], "PHP") == 689 * P
    assert share_of(4_000 * P, PERIOD_DAYS["semi_monthly"], 7, "PHP") == 1_839 * P
    assert share_of(4_000 * P, Decimal(0), 7, "PHP") == 0


def test_plan_can_only_make_the_week_stricter():
    today, payday = date(2026, 9, 23), date(2026, 10, 5)
    last_day, period = cycle_end(today, payday)
    start, end = week_window(today, last_day, None)

    def week(balance: int, joy: int, needs: int, joy_spent: int = 0) -> dict:  # type: ignore[type-arg]
        return compute_safe_to_spend(SafeToSpendInputs(
            today=today, currency="PHP", spendable_balance_minor=balance * P, next_income_on=payday, next_income_label="Salary",
            commitments=[], card_owed_minor=0, buffer_minor=0, week_start=start, week_end=end, spent_this_week_minor=joy_spent * P,
            plan=PlanWeek(joy_per_period_minor=joy * P, needs_per_period_minor=needs * P, period_days=Decimal(14),
                          joy_spent_minor=joy_spent * P, needs_spent_minor=0),
        ), last_day, period).week

    strict = week(20_000, joy=1_400, needs=2_800, joy_spent=300)
    assert strict["plan"]["joy_allowance_minor"] == 700 * P and strict["plan"]["joy_left_minor"] == 400 * P
    assert strict["left_minor"] == (400 + 1_400) * P and strict["plan"]["limited_by"] == "plan"
    poor = week(1_000, joy=14_000, needs=14_000)
    assert poor["left_minor"] == poor["allowance_minor"] and poor["plan"]["limited_by"] == "money"


async def _setup(client) -> dict:  # type: ignore[no-untyped-def]
    account = (await client.post("/api/v1/accounts", json={"name": "BPI", "type": "bank", "opening_balance_minor": 30_000 * P})).json()
    await client.patch("/api/v1/me/settings", json={"safe_to_spend_buffer_minor": 0})
    await client.post("/api/v1/recurring", json={"name": "Salary", "kind": "income", "amount_minor": 20_000 * P, "frequency": "semi_monthly",
                                                 "next_due_on": (TODAY + timedelta(days=9)).isoformat(), "account_id": account["id"]})
    await client.post("/api/v1/recurring", json={"name": "Rent", "kind": "rent", "amount_minor": 8_000 * P, "frequency": "monthly",
                                                 "next_due_on": (TODAY + timedelta(days=20)).isoformat(), "account_id": account["id"]})
    cats = {c["name"]: c for c in (await client.get("/api/v1/categories")).json() if c["parent_id"] is None and c["kind"] == "expense"}
    return {"account": account, "cats": cats}


async def test_money_plan_flow(client, other_client):
    ctx = await _setup(client)
    empty = (await client.get("/api/v1/money-plan")).json()
    assert empty["configured"] is False and empty["income"]["source"] == "schedule"
    assert empty["period"]["label"] == "Salary, twice a month"
    assert empty["commitments_minor"] == 4_000 * P  # ₱8,000 rent a month is ₱4,000 per paycheck

    r = await client.put("/api/v1/money-plan", json={"savings_minor": 4_000 * P, "joy_minor": 3_000 * P})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["configured"] is True
    assert body["allocation"]["needs_minor"] == 9_000 * P and body["allocation"]["unassigned_minor"] == 0

    for name, amount in (("Food & Dining", 500), ("Groceries", 300)):
        await client.post("/api/v1/transactions", json={"type": "expense", "amount_minor": amount * P, "occurred_on": TODAY.isoformat(),
                                                         "account_id": ctx["account"]["id"], "category_id": ctx["cats"][name]["id"]})
    period = (await client.get("/api/v1/money-plan")).json()["this_period"]
    assert period["joy_spent_minor"] == 500 * P and period["joy_left_minor"] == 2_500 * P
    assert period["needs_spent_minor"] == 300 * P

    week = (await client.get("/api/v1/dashboard")).json()["safe_to_spend"]["week"]
    assert week["plan"]["joy_spent_minor"] == 500 * P
    assert week["left_minor"] <= week["plan"]["joy_left_minor"] + week["plan"]["needs_left_minor"]

    check = (await client.post("/api/v1/check", json={"amount_minor": 1_000 * P, "category_id": ctx["cats"]["Shopping"]["id"]})).json()
    assert check["plan_impact"]["bucket"] == "joy"
    assert check["plan_impact"]["left_after_minor"] == check["plan_impact"]["left_before_minor"] - 1_000 * P
    needs_check = (await client.post("/api/v1/check", json={"amount_minor": 100 * P, "category_id": ctx["cats"]["Groceries"]["id"]})).json()
    assert needs_check["plan_impact"]["bucket"] == "needs"

    answer = await ask(client, "How much Joy Money do I have left?")
    assert "₱2,500" in answer["text"] and answer["done"]["validation"] == "passed"

    assert (await other_client.get("/api/v1/money-plan")).json()["configured"] is False
    assert (await client.delete("/api/v1/money-plan")).status_code == 204
    assert (await client.get("/api/v1/dashboard")).json()["safe_to_spend"]["week"]["plan"] is None


async def test_money_plan_without_income_schedule(client):
    await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 5_000 * P})
    missing = await client.put("/api/v1/money-plan", json={"joy_minor": 500 * P})
    assert missing.status_code == 400
    r = await client.put("/api/v1/money-plan", json={"income_minor": 5_000 * P, "joy_minor": 1_000 * P, "savings_minor": 500 * P})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["period"]["label"] == "Each month" and body["income"]["source"] == "custom"
    assert body["allocation"]["needs_minor"] == 3_500 * P


async def test_preview_does_not_save(client):
    await _setup(client)
    preview = (await client.post("/api/v1/money-plan/preview", json={"savings_minor": 1_000 * P, "joy_minor": 20_000 * P})).json()
    assert preview["allocation"]["unassigned_minor"] == (20_000 - 4_000 - 1_000 - 20_000) * P
    assert any(w["code"] == "over_assigned" for w in preview["allocation"]["warnings"])
    assert (await client.get("/api/v1/money-plan")).json()["configured"] is False


def test_bar_shows_the_plans_week_when_the_plan_is_the_limit():
    today, payday = date(2026, 9, 23), date(2026, 10, 5)
    last_day, period = cycle_end(today, payday)
    start, end = week_window(today, last_day, None)
    w = compute_safe_to_spend(SafeToSpendInputs(
        today=today, currency="PHP", spendable_balance_minor=20_000 * P, next_income_on=payday, next_income_label="Salary",
        commitments=[], card_owed_minor=0, buffer_minor=0, week_start=start, week_end=end, spent_this_week_minor=300 * P,
        plan=PlanWeek(joy_per_period_minor=1_400 * P, needs_per_period_minor=2_800 * P, period_days=Decimal(14),
                      joy_spent_minor=300 * P, needs_spent_minor=100 * P),
    ), last_day, period).week
    assert w["allowance_minor"] == 2_100 * P and w["spent_minor"] == 400 * P and w["left_minor"] == 1_700 * P
