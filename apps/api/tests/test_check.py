from datetime import timedelta

from app.engine.check import CheckInputs, run_check
from app.engine.periods import today_in

P = 100
TODAY = today_in("Asia/Manila")


def check(amount: float, safe: float = 8_650, week_left: float = 2_000, days_left: int = 10, **extra):  # type: ignore[no-untyped-def]
    return run_check(CheckInputs(amount_minor=round(amount * P), currency="PHP", safe_raw_minor=round(safe * P), days_left=days_left,
                                 week_left_minor=round(week_left * P), planned_savings_minor=extra.pop("planned", 0), **extra))


def test_brief_example_headphones_stretch():
    r = check(5_999)
    assert r["verdict"] == "stretch"
    assert r["safe_before_minor"] == 8_650 * P
    assert r["safe_after_minor"] == 2_651 * P
    assert r["per_day_after_minor"] == 265 * P
    assert r["week_left_after_minor"] == -3_999 * P
    assert r["goal_impact"] is None


def test_small_purchase_fits_this_week():
    r = check(180)
    assert r["verdict"] == "fits"
    assert r["week_left_after_minor"] == 1_820 * P


def test_over_safe_to_spend_estimates_goal_delay():
    r = check(10_000, planned=6_000 * P, goal_name="Laptop", goal_monthly_pace_minor=3_000 * P)
    assert r["verdict"] == "over"
    assert r["over_by_minor"] == 1_350 * P
    assert r["safe_after_minor"] == 0 and r["raw_after_minor"] == -1_350 * P
    assert r["goal_impact"] == {"goal": "Laptop", "savings_at_risk_minor": 1_350 * P, "delay_days": 14, "is_estimate": True}


def test_negative_safe_to_spend_means_everything_is_over():
    r = check(100, safe=-500, week_left=0)
    assert r["verdict"] == "over"
    assert r["safe_before_minor"] == 0
    assert r["over_by_minor"] == 100 * P


def test_budget_impact():
    r = check(1_000, budget_category="Shopping", budget_remaining_minor=600 * P)
    assert r["budget_impact"] == {"category": "Shopping", "remaining_before_minor": 600 * P, "remaining_after_minor": -400 * P,
                                  "would_exceed": True}


async def test_check_api_uses_safe_to_spend(client, other_client):
    account = (await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 5_000 * P})).json()
    await client.patch("/api/v1/me/settings", json={"safe_to_spend_buffer_minor": 1_000 * P})
    await client.post("/api/v1/recurring", json={"name": "Load", "kind": "bill", "amount_minor": 300 * P, "frequency": "monthly",
                                                 "next_due_on": (TODAY + timedelta(days=2)).isoformat(), "account_id": account["id"]})
    r = await client.post("/api/v1/check", json={"amount_minor": 2_000 * P, "label": "Shoes"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["safe_before_minor"] == (5_000 - 300 - 1_000) * P
    assert body["safe_after_minor"] == (5_000 - 300 - 1_000 - 2_000) * P
    assert body["commitments"][0]["label"] == "Load"
    assert body["verdict"] in {"fits", "stretch"}

    over = (await client.post("/api/v1/check", json={"amount_minor": 9_000 * P})).json()
    assert over["verdict"] == "over"

    their_category = (await other_client.get("/api/v1/categories")).json()[0]["id"]
    assert (await client.post("/api/v1/check", json={"amount_minor": 100, "category_id": their_category})).status_code == 404
    assert (await client.post("/api/v1/check", json={"amount_minor": 0})).status_code == 422
