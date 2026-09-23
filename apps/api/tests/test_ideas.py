import json
from collections.abc import AsyncIterator
from datetime import date
from typing import Any

from app.ai.providers.anthropic_provider import _hint
from app.ai.providers.base import ModelTurn, ProviderUnavailable, TextDelta, TranscriptItem
from app.ai.providers.local_provider import plan
from app.ai.tools.registry import ToolContext, run_tool
from app.core.db import scoped_session
from tests.conftest import make_user
from tests.test_ai_streaming import _run, _user
from tests.test_future_purchase import _ask_offline, _saver

TITO = "suggest ka nga ng gift ideas para sa tito ko, budget is below ₱10k."
NINONG = "Nagbigay ng ₱10k yung ninong ko. Mag-suggest ka nga ng magandang pwedeng bilhin with that budget?"


async def test_suggested_ideas_come_back_priced_checked_and_unsaved(app):
    uid, settings, today = await _saver(app)
    async with scoped_session(uid) as db:
        output, record = await run_tool(ToolContext(db=db, user_id=uid, settings=settings, today=today), "suggest_ideas", {
            "topic": "Gift ideas for your tito", "budget": 5000, "ideas": [
                {"name": "Men's perfume", "why": "A classic.", "price_low": 1500, "price_high": 4500, "category": "Gifts & Family"},
                {"name": "Wristwatch", "why": "Useful daily.", "price_low": 2000, "price_high": 6000, "category": None},
            ]})
    assert record["ok"]
    r = output.result
    assert r["budget_minor"] == 500_000 and r["is_estimate"] is True
    assert r["ideas"][0]["price_range"] == "₱1,500 to ₱4,500" and r["ideas"][0]["within_budget"] is True
    assert r["ideas"][1]["within_budget"] is False
    block = output.blocks[0]
    assert block["type"] == "ideas" and block["items"][0]["low_minor"] == 150_000 and block["budget_minor"] == 500_000
    assert "safe_to_spend_minor" in r and r["budget_fits_safe_to_spend"] in {True, False}


async def test_asking_for_ideas_is_never_logged(app):
    client = await make_user(app, "Asker")
    await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 500_000})
    for text in (TITO, NINONG, "what can I buy with 3k", "recommend a phone under 15k"):
        r = (await client.post("/api/v1/capture/parse", json={"text": text})).json()
        assert r["is_financial"] is False, text
    assert (await client.post("/api/v1/capture/parse", json={"text": "Spent 250 on lunch"})).json()["is_financial"] is True
    await client.aclose()


def test_the_fallback_planner_suggests_for_the_right_person():
    today = date(2026, 9, 23)
    intent, calls = plan(TITO, today)
    args = calls[0].arguments
    assert intent == "ideas" and calls[0].name == "suggest_ideas"
    assert args["topic"] == "Gift ideas for your tito" and args["budget"] == 10_000
    assert all(i["price_high"] <= 10_000 for i in args["ideas"]) and len(args["ideas"]) >= 3
    _, calls = plan(NINONG, today)
    assert calls[0].arguments["topic"] == "Ideas for your money", "the ninong gave the money; the ideas are for the user"
    assert plan("Should I buy a ₱3,000 jacket?", today)[1][0].name == "calculate_affordability"


async def test_offline_faldo_answers_with_ideas_not_a_budget_report(app):
    uid, settings, _ = await _saver(app)
    text, done = await _ask_offline(uid, settings, NINONG)
    assert "budget for" not in text and "Plan it" in text and "log it as income" in text
    assert [c["name"] for c in done["tool_calls"]] == ["suggest_ideas"] and done["validation"] == "passed", text


class BrokeClaude:
    """Claude with no credits: refuses with the reason attached."""

    name = "anthropic"
    is_development = False
    supports_vision = True

    async def assistant_turn(self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]) -> ModelTurn:
        raise AssertionError("streamed")

    async def stream_turn(self, *, system: str, transcript: list[TranscriptItem],
                          tools: list[dict[str, Any]]) -> AsyncIterator[TextDelta | ModelTurn]:
        body = json.dumps({"error": {"type": "invalid_request_error", "message": "Your credit balance is too low to access the Anthropic API."}})
        raise ProviderUnavailable("The AI service is temporarily unavailable.", _hint(400, body.encode()))
        yield TextDelta("")  # pragma: no cover


async def test_backup_answers_say_why_claude_is_not_answering(app):
    uid, settings = await _user(app)
    events = await _run(uid, settings, BrokeClaude(), "How much did I spend this month?")  # type: ignore[arg-type]
    done = next(e["data"] for e in events if e["event"] == "done")
    assert done["provider"] == "local" and "no API credits" in done["fallback_hint"]
    assert "isn't valid" in _hint(401, b'{"error": {"type": "authentication_error", "message": "invalid x-api-key"}}')
    assert "busy" in _hint(529, b'{"error": {"type": "overloaded_error", "message": "Overloaded"}}')
