import uuid
from datetime import date, timedelta
from typing import Any

from app.ai.assistant import service as assistant_service
from app.ai.providers.local_provider import LocalDevelopmentProvider, plan
from app.ai.tools.registry import ToolContext, ToolOutput, run_tool
from app.core.db import scoped_session
from app.engine.periods import add_months, month_start, today_in
from app.models import UserSettings
from tests.conftest import make_user

P = 100
NO_ARGS = {"price": None, "price_is_estimate": False, "target_date": None, "months_from_now": None}


async def _saver(app, goal: dict[str, Any] | None = None) -> tuple[uuid.UUID, UserSettings, date]:  # type: ignore[no-untyped-def]
    """Someone who earned ₱30,000 and spent ₱20,000 in each of the last three full months: ₱10,000 a month left over."""
    client = await make_user(app, "Planner")
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    account = (await client.post("/api/v1/accounts", json={"name": "BPI", "type": "bank", "opening_balance_minor": 0})).json()
    today = today_in("Asia/Manila")
    for back in (1, 2, 3):
        day = add_months(month_start(today), -back) + timedelta(days=9)
        for kind, amount, merchant in (("income", 30_000 * P, "Allowance"), ("expense", 20_000 * P, "Dorm")):
            r = await client.post("/api/v1/transactions", json={"type": kind, "amount_minor": amount, "occurred_on": day.isoformat(),
                                                               "account_id": account["id"], "merchant": merchant})
            assert r.status_code == 201, r.text
    if goal:
        assert (await client.post("/api/v1/goals", json=goal)).status_code == 201
    await client.aclose()
    async with scoped_session(uid) as db:
        settings = await db.get(UserSettings, uid)
    assert settings is not None
    return uid, settings, today


async def _plan(uid: uuid.UUID, settings: UserSettings, today: date, **args: Any) -> ToolOutput:
    async with scoped_session(uid) as db:
        output, record = await run_tool(ToolContext(db=db, user_id=uid, settings=settings, today=today),
                                        "plan_future_purchase", {**NO_ARGS, **args})
    return output


async def test_a_future_purchase_is_split_into_monthly_and_weekly_savings(app):
    uid, settings, today = await _saver(app)
    target = add_months(month_start(today), 20)
    out = await _plan(uid, settings, today, item="iPhone 18 Pro", price=90_000, target_date=target.isoformat())
    r = out.result
    assert r["months_left"] == 20 and r["price_minor"] == 9_000_000 and r["price_source"] == "you"
    assert r["save_per_month_minor"] == 450_000 and r["save_per_week_minor"] == 103_900
    assert r["usual_monthly_surplus_minor"] == 1_000_000 and r["share_of_usual_surplus_pct"] == 45
    assert r["on_track_for_target"] is True and r["is_estimate"] is True
    assert out.blocks[0]["title"] == f"iPhone 18 Pro by {target:%b %Y}"


async def test_a_matching_goal_supplies_the_price_and_what_is_saved(app):
    uid, settings, today = await _saver(app, {"name": "MacBook Air", "target_minor": 75_000 * P, "initial_amount_minor": 15_000 * P})
    r = (await _plan(uid, settings, today, item="MacBook", months_from_now=12)).result
    assert r["price_source"] == "goal" and r["matching_goal"] == "MacBook Air"
    assert r["saved_so_far_minor"] == 1_500_000 and r["still_needed_minor"] == 6_000_000
    assert r["save_per_month_minor"] == 500_000 and r["share_of_usual_surplus_pct"] == 50


async def test_without_a_price_or_goal_it_asks_and_past_dates_are_refused(app):
    uid, settings, today = await _saver(app)
    r = (await _plan(uid, settings, today, item="iPhone 18 Pro", target_date="2028-07-01")).result
    assert r["needs_price"] is True and r["months_left"] > 0 and r["usual_monthly_surplus_minor"] == 1_000_000
    past = (await _plan(uid, settings, today, item="Phone", price=10_000, target_date=(today - timedelta(days=40)).isoformat())).result
    assert "error" in past


def test_the_fallback_planner_reads_plans_to_buy_in_english_and_taglish():
    today = date(2026, 9, 23)
    cases = {
        "so plano ko bumili ng iphone 18 pro in 2028 july sa graduation ko, magkano ipon ko?":
            {"item": "iphone 18 pro", "price": None, "target_date": "2028-07-01"},
        "balak kong bumili ng motor sa Disyembre 2027 mga 85,000": {"item": "motor", "price": 85_000, "target_date": "2027-12-01"},
        "How much should I save for a ₱60k laptop by December?": {"item": "laptop", "price": 60_000, "target_date": "2026-12-01"},
        "I plan to get a new phone in 8 months, 45000": {"item": "phone", "price": 45_000, "months_from_now": 8},
        "I want to buy a ₱150,000 motorcycle in 6 months": {"item": "motorcycle", "price": 150_000, "months_from_now": 6},
        "save for a 45k phone": {"item": "phone", "price": 45_000, "target_date": None},
    }
    for question, expected in cases.items():
        intent, calls = plan(question, today)
        assert intent == "future_purchase" and calls[0].name == "plan_future_purchase", question
        assert {k: calls[0].arguments[k] for k in expected} == expected, question
    for past_or_other in ("What did I buy in March?", "Can I afford a ₱3,000 purchase?", "may ipon ba ako para sa laptop?"):
        assert plan(past_or_other, today)[1][0].name != "plan_future_purchase", past_or_other


async def _ask_offline(uid: uuid.UUID, settings: UserSettings, question: str) -> tuple[str, dict[str, Any]]:
    original = assistant_service.get_llm
    assistant_service.get_llm = lambda: LocalDevelopmentProvider()  # type: ignore[assignment]
    try:
        events = [e async for e in assistant_service.stream_answer(uid, settings, today_in(settings.timezone), question, None, None)]
    finally:
        assistant_service.get_llm = original
    text = "".join(e["data"]["text"] for e in events if e["event"] == "delta")
    return text, next(e["data"] for e in events if e["event"] == "done")


async def test_offline_faldo_predicts_instead_of_saying_it_found_nothing(app):
    uid, settings, _ = await _saver(app)
    text, done = await _ask_offline(uid, settings, "When can I afford my MacBook?")
    assert "No goal matching" not in text and "price" in text and "₱10,000" in text
    assert [c["name"] for c in done["tool_calls"]] == ["get_goal_progress", "plan_future_purchase"]

    text, done = await _ask_offline(uid, settings, "plano ko bumili ng iphone 18 pro sa July 2028, ₱90,000, magkano ipon ko?")
    assert "a month" in text and "a week" in text and "estimates" in text
    assert done["validation"] == "passed", text
