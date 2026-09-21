from datetime import date, timedelta

from app.engine.periods import today_in
from app.engine.planning import monthly_equivalent, occurrences_between

P = 100
TODAY = today_in("Asia/Manila")


def test_one_time_frequency_happens_once():
    d = date(2026, 10, 5)
    assert occurrences_between(d, "once", 1, date(2026, 9, 1), date(2026, 12, 31)) == [d]
    assert occurrences_between(d, "once", 1, date(2026, 10, 6), date(2026, 12, 31)) == []
    assert monthly_equivalent(15_000 * P, "once") == 0


async def _account(client, opening=10_000 * P):  # type: ignore[no-untyped-def]
    return (await client.post("/api/v1/accounts", json={"name": "BPI", "type": "bank", "opening_balance_minor": opening})).json()


async def test_goal_starting_amount_is_not_this_months_saving(client):
    await _account(client)
    await client.patch("/api/v1/me/settings", json={"safe_to_spend_buffer_minor": 0})
    goal = (await client.post("/api/v1/goals", json={"name": "Laptop", "target_minor": 60_000 * P, "monthly_contribution_minor": 3_000 * P,
                                                     "initial_amount_minor": 9_000 * P})).json()
    assert goal["saved_minor"] == 9_000 * P
    assert goal["average_monthly_minor"] == 0  # the starting amount isn't a saving pace
    assert goal["contributions"][0]["is_initial"] is True
    sts = (await client.get("/api/v1/dashboard")).json()["safe_to_spend"]
    savings = next(line for line in sts["lines"] if line["key"] == "savings")
    assert savings["amount_minor"] >= 3_000 * P  # this month's planned saving is still set aside

    await client.post(f"/api/v1/goals/{goal['id']}/contributions", json={"amount_minor": 1_000 * P, "occurred_on": TODAY.isoformat()})
    sts = (await client.get("/api/v1/dashboard")).json()["safe_to_spend"]
    savings = next(line for line in sts["lines"] if line["key"] == "savings")
    this_month = [i for i in savings["items"] if i["date"] <= (TODAY + timedelta(days=1)).isoformat()]
    assert sum(i["amount_minor"] for i in this_month) == 2_000 * P


async def test_one_time_expected_income_is_never_spendable_or_the_window(client):
    account = await _account(client)
    await client.patch("/api/v1/me/settings", json={"safe_to_spend_buffer_minor": 0})
    due = TODAY + timedelta(days=5)
    r = await client.post("/api/v1/recurring", json={"name": "Client payment", "kind": "income", "amount_minor": 15_000 * P,
                                                     "frequency": "once", "next_due_on": due.isoformat(), "account_id": account["id"]})
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["monthly_equivalent_minor"] == 0
    sts = (await client.get("/api/v1/dashboard")).json()["safe_to_spend"]
    assert sts["period"] == "rolling" and sts["raw_minor"] == 10_000 * P
    upcoming = (await client.get("/api/v1/recurring/upcoming", params={"days": 30})).json()
    assert [u["is_one_time"] for u in upcoming] == [True]
    fc = (await client.get("/api/v1/forecast", params={"horizon": "30_days"})).json()
    assert any(e["kind"] == "expected_income" for e in fc["events"])
    assert any("may not arrive" in a for a in fc["assumptions"])

    paid = await client.post(f"/api/v1/recurring/{item['id']}/pay", json={})
    assert paid.status_code == 200 and paid.json()["type"] == "income"
    after = next(r for r in (await client.get("/api/v1/recurring")).json() if r["id"] == item["id"])
    assert after["is_active"] is False
    assert (await client.get("/api/v1/recurring/upcoming", params={"days": 30})).json() == []
    sts = (await client.get("/api/v1/dashboard")).json()["safe_to_spend"]
    assert sts["raw_minor"] == 25_000 * P  # counted once it's actually received


async def test_planned_purchases_with_a_date_are_in_the_forecast_not_safe_to_spend(client):
    await _account(client)
    await client.patch("/api/v1/me/settings", json={"safe_to_spend_buffer_minor": 0})
    before = (await client.get("/api/v1/forecast", params={"horizon": "30_days"})).json()
    await client.post("/api/v1/planned-purchases", json={"name": "Shoes", "amount_minor": 4_000 * P,
                                                         "target_date": (TODAY + timedelta(days=10)).isoformat()})
    await client.post("/api/v1/planned-purchases", json={"name": "Someday", "amount_minor": 9_000 * P})
    fc = (await client.get("/api/v1/forecast", params={"horizon": "30_days"})).json()
    planned = [e for e in fc["events"] if e["kind"] == "planned"]
    assert [(e["label"], e["amount_minor"]) for e in planned] == [("Shoes", -4_000 * P)]
    assert fc["end_balance"]["p50"] == before["end_balance"]["p50"] - 4_000 * P
    assert fc["safe_to_spend"]["raw_minor"] == 10_000 * P
    scenario = (await client.post("/api/v1/forecast/scenario", json={"horizon": "30_days", "adjustments": [
        {"kind": "one_time_expense", "amount_minor": 100 * P}]})).json()
    assert next(line for line in scenario["lines"] if line["key"] == "planned")["amount_minor"] == 4_000 * P
