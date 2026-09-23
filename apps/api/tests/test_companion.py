import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from datetime import date, timedelta
from typing import Any

import httpx
from sqlalchemy import select

from app.ai.assistant import service as assistant_service
from app.ai.providers.anthropic_provider import AnthropicProvider, _messages
from app.ai.providers.base import ModelTurn, TextDelta, TranscriptItem
from app.ai.providers.local_provider import LocalDevelopmentProvider, plan
from app.ai.tools.registry import ToolContext, run_tool
from app.core.config import Settings
from app.core.db import scoped_session
from app.engine.periods import today_in
from app.models import AIConversation, UserSettings
from app.services import companion, push
from tests.conftest import ApiClient, make_user

P = 100


async def _person(app, name: str = "Companion") -> tuple[ApiClient, uuid.UUID, dict[str, Any]]:  # type: ignore[no-untyped-def]
    client = await make_user(app, name)
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    account = (await client.post("/api/v1/accounts", json={"name": "GCash", "type": "e_wallet", "opening_balance_minor": 20_000 * P})).json()
    return client, uid, account


async def _settings(uid: uuid.UUID) -> UserSettings:
    async with scoped_session(uid) as db:
        settings = await db.get(UserSettings, uid)
    assert settings is not None
    return settings


async def _tool(uid: uuid.UUID, name: str, args: dict[str, Any]) -> Any:
    settings = await _settings(uid)
    async with scoped_session(uid) as db:
        output, record = await run_tool(ToolContext(db=db, user_id=uid, settings=settings, today=today_in(settings.timezone)), name, args)
    return output


ACTION = {"name": None, "amount": None, "category": None, "date": None, "transaction_type": None, "account": None,
          "monthly_amount": None, "fact": None, "challenge": None, "days": None}


# Check-ins and the calendar ------------------------------------------------------------------------------------------

def test_philippine_money_moments_come_up_at_the_right_time():
    def kinds(d: date) -> set[str]:
        return {s.key.split(":")[1] for s in companion.seasonal(d)}

    assert {"christmas", "13th"} <= kinds(date(2026, 11, 20))
    assert "undas" in kinds(date(2026, 10, 25)) and "christmas" not in kinds(date(2026, 10, 25))
    assert "mother'sday" in kinds(date(2027, 5, 1))  # the second Sunday of May 2027 is May 9
    assert "school" in kinds(date(2027, 6, 1)) and "newyear" in kinds(date(2026, 12, 29))
    assert kinds(date(2026, 9, 23)) == set(), "nothing seasonal in late September"


async def test_birthdays_you_told_faldo_become_check_ins(app):
    client, uid, _ = await _person(app)
    soon = today_in("Asia/Manila") + timedelta(days=10)
    await client.post("/api/v1/notes", json={"content": f"Tito Ben's birthday is {soon:%B} {soon.day}"})
    await client.post("/api/v1/notes", json={"content": "Lent ₱3,000 to my brother"})
    body = (await client.get("/api/v1/assistant/companion")).json()
    await client.aclose()
    birthday = next(c for c in body["checkins"] if c["kind"] == "birthday")
    assert birthday["title"] == "A birthday is in 10 days" and "Tito Ben" in birthday["body"] and birthday["mood"] == "love"
    assert 1 <= len(body["starters"]) <= 4 and all(s["prompt"] for s in body["starters"])


async def test_several_due_bills_become_one_check_in(app):
    client, uid, account = await _person(app)
    today = today_in("Asia/Manila")
    for name, days in (("Internet", -3), ("Meralco", 1)):
        await client.post("/api/v1/recurring", json={"name": name, "kind": "bill", "amount_minor": 1_500 * P, "frequency": "monthly",
                                                     "next_due_on": (today + timedelta(days=days)).isoformat(), "account_id": account["id"]})
    checkins = (await client.get("/api/v1/assistant/companion")).json()["checkins"]
    await client.aclose()
    bills = [c for c in checkins if c["kind"] == "bill"]
    assert len(bills) == 1 and bills[0]["title"] == "2 bills need you, 1 overdue" and "₱3,000" in bills[0]["body"]


# Challenges ----------------------------------------------------------------------------------------------------------

async def test_a_daily_ipon_challenge_saves_into_its_own_goal(app):
    client, uid, account = await _person(app)
    started = (await client.post("/api/v1/challenges", json={"kind": "ipon_daily", "amount_minor": 50 * P, "days": 30})).json()
    assert started["target_minor"] == 1_500 * P and started["state"] == "active" and started["goal_id"]
    assert started["on_track"] is True and started["next_step"] == "Save ₱50 today", "nothing is due until the day is over"
    today = today_in("Asia/Manila")
    await client.post(f"/api/v1/goals/{started['goal_id']}/contributions", json={"amount_minor": 50 * P, "occurred_on": today.isoformat()})
    [progress] = (await client.get("/api/v1/challenges")).json()
    assert progress["saved_minor"] == 50 * P and progress["on_track"] is True and progress["next_step"] == "You're done for today"
    await client.post(f"/api/v1/challenges/{started['id']}/end")
    [ended] = (await client.get("/api/v1/challenges")).json()
    await client.aclose()
    assert ended["status"] == "ended" and ended["next_step"] is None


async def test_no_spend_and_spending_caps_follow_real_spending(app):
    client, uid, account = await _person(app)
    categories = (await client.get("/api/v1/categories")).json()
    food = next(c for c in categories if c["kind"] == "expense" and c["name"].startswith("Food"))
    no_spend = (await client.post("/api/v1/challenges", json={"kind": "no_spend", "category_id": food["id"], "days": 7})).json()
    cap = (await client.post("/api/v1/challenges", json={"kind": "spend_cap", "category_id": food["id"], "amount_minor": 1_000 * P,
                                                         "days": 7})).json()
    assert no_spend["on_track"] is True and cap["left_minor"] == 1_000 * P
    await client.post("/api/v1/transactions", json={"type": "expense", "amount_minor": 1_200 * P, "account_id": account["id"],
                                                    "occurred_on": today_in("Asia/Manila").isoformat(), "category_id": food["id"]})
    items = {c["kind"]: c for c in (await client.get("/api/v1/challenges")).json()}
    assert items["no_spend"]["on_track"] is False and items["no_spend"]["days_spent"] == 1
    assert items["spend_cap"]["state"] == "missed" and items["spend_cap"]["summary"].endswith("over the cap")
    assert (await client.post("/api/v1/challenges", json={"kind": "spend_cap", "amount_minor": 100})).status_code == 400
    await client.aclose()


# Actions Faldo proposes and the user confirms ------------------------------------------------------------------------

async def test_proposed_actions_are_cards_the_real_endpoints_accept(app):
    client, uid, account = await _person(app)
    categories = (await client.get("/api/v1/categories")).json()
    food = next(c for c in categories if c["kind"] == "expense" and c["name"].startswith("Food") and not c["parent_id"])
    transport = next(c for c in categories if c["kind"] == "expense" and c["name"].startswith("Transport") and not c["parent_id"])
    month = today_in("Asia/Manila").strftime("%Y-%m")
    await client.put("/api/v1/budgets", json={"month": month, "lines": [{"category_id": transport["id"], "limit_minor": 2_000 * P}]})

    cases = [
        {**ACTION, "action": "create_goal", "name": "iPhone 18 Pro", "amount": 90_000, "date": "2028-07-01", "monthly_amount": 4_100},
        {**ACTION, "action": "set_budget", "category": "food", "amount": 6_000},
        {**ACTION, "action": "log_transaction", "transaction_type": "income", "amount": 10_000, "name": "Ninong"},
        {**ACTION, "action": "add_planned_purchase", "name": "Wireless earbuds", "amount": 2_500},
        {**ACTION, "action": "remember", "fact": "My allowance is ₱8,000 a month"},
        {**ACTION, "action": "start_challenge", "challenge": "ipon_52", "amount": 20},
    ]
    for args in cases:
        output = await _tool(uid, "propose_action", args)
        [block] = output.blocks
        assert block["type"] == "action" and output.result["proposed"] == args["action"], output.result
        request = block["request"]
        response = await client.request(request["method"], "/api/v1" + request["path"], json=request["body"])
        assert response.status_code in {200, 201, 204}, (args["action"], response.text)

    budget = (await client.get("/api/v1/budgets", params={"month": month})).json()
    limits = {line["category_id"]: line["limit_minor"] for line in budget["lines"]}
    assert limits == {transport["id"]: 2_000 * P, food["id"]: 6_000 * P}, "setting one budget keeps the others"
    goal = next(g for g in (await client.get("/api/v1/goals")).json() if g["name"] == "iPhone 18 Pro")
    assert goal["target_minor"] == 90_000 * P and goal["target_date"] == "2028-07-01"
    notes = (await client.get("/api/v1/notes")).json()
    assert notes[0]["content"] == "My allowance is ₱8,000 a month"
    await client.aclose()


async def test_actions_that_need_more_detail_ask_instead_of_guessing(app):
    client, uid, _ = await _person(app)
    await client.aclose()
    assert "error" in (await _tool(uid, "propose_action", {**ACTION, "action": "create_goal", "name": "Trip"})).result
    unknown = (await _tool(uid, "propose_action", {**ACTION, "action": "mark_bill_paid", "name": "Netflix"})).result
    assert unknown["error"].startswith("Ask which bill")


def test_the_fallback_understands_remember_challenges_and_goals():
    today = date(2026, 9, 23)
    _, calls = plan("Remember that my tito's birthday is December 12", today)
    assert calls[0].arguments["action"] == "remember" and calls[0].arguments["fact"] == "my tito's birthday is December 12"
    _, calls = plan("start a 52 week challenge", today)
    assert calls[0].arguments["challenge"] == "ipon_52" and calls[0].arguments["amount"] == 20
    _, calls = plan("Make it a goal: iPhone 18 Pro 90k by July 2028", today)
    assert {k: calls[0].arguments[k] for k in ("name", "amount", "date")} == {"name": "iPhone 18 Pro", "amount": 90_000, "date": "2028-07-01"}
    assert plan("How is my challenge going?", today)[1][0].name == "get_challenges"


# Memory, recall and photos -------------------------------------------------------------------------------------------

class Recorder:
    """Answers plainly and keeps each system prompt, so tests can see what Faldo was told."""

    name = "recorder"
    is_development = False
    supports_vision = True

    def __init__(self) -> None:
        self.systems: list[str] = []
        self.transcripts: list[list[TranscriptItem]] = []

    async def assistant_turn(self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]) -> ModelTurn:
        raise AssertionError("streamed")

    async def stream_turn(self, *, system: str, transcript: list[TranscriptItem],
                          tools: list[dict[str, Any]]) -> AsyncIterator[TextDelta | ModelTurn]:
        self.systems.append(system)
        self.transcripts.append(list(transcript))
        yield TextDelta("Noted.")
        yield ModelTurn(text="Noted.")

    async def summarize_conversation(self, prompt: str) -> str:
        return "They planned a graduation iPhone for July 2028."


async def _ask(uid: uuid.UUID, provider: Any, question: str, conversation_id: uuid.UUID | None = None,
               image: dict[str, str] | None = None) -> list[dict[str, Any]]:
    settings = await _settings(uid)
    original = assistant_service.get_llm
    assistant_service.get_llm = lambda: provider  # type: ignore[assignment]
    try:
        return [e async for e in assistant_service.stream_answer(uid, settings, today_in(settings.timezone), question, conversation_id,
                                                                 None, image)]
    finally:
        assistant_service.get_llm = original


async def test_faldo_remembers_you_and_earlier_chats(app):
    client, uid, _ = await _person(app)
    await client.post("/api/v1/notes", json={"content": "I'm a student; my allowance is ₱8,000 a month."})
    await client.aclose()
    recorder = Recorder()
    first = await _ask(uid, recorder, "Plano ko bumili ng iPhone sa July 2028")
    conversation_id = uuid.UUID(next(e["data"]["id"] for e in first if e["event"] == "conversation"))
    async with scoped_session(uid) as db:
        conversation = await db.get(AIConversation, conversation_id)
        assert conversation is not None and conversation.summary == "They planned a graduation iPhone for July 2028."
    await _ask(uid, recorder, "Hi again")
    latest = recorder.systems[-1]
    assert "my allowance is ₱8,000 a month" in latest and "graduation iPhone for July 2028" in latest


async def test_the_fallback_writes_a_plain_summary(app):
    client, uid, _ = await _person(app)
    await client.aclose()
    first = await _ask(uid, LocalDevelopmentProvider(), "How much did I spend this month?")
    conversation_id = uuid.UUID(next(e["data"]["id"] for e in first if e["event"] == "conversation"))
    async with scoped_session(uid) as db:
        summary = (await db.execute(select(AIConversation.summary).where(AIConversation.id == conversation_id))).scalar_one()
    assert summary and summary.startswith("They asked: How much did I spend this month?")


async def test_photos_reach_the_model_and_basic_mode_says_it_cannot_see_them(app):
    client, uid, _ = await _person(app)
    await client.aclose()
    photo = {"media_type": "image/jpeg", "data": "A" * 200}
    recorder = Recorder()
    await _ask(uid, recorder, "kaya ko ba 'to?", image=photo)
    user_turn = recorder.transcripts[-1][-1]
    assert user_turn.images == [photo]
    content = _messages([user_turn])[0]["content"]
    assert content[0] == {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "A" * 200}}
    events = await _ask(uid, LocalDevelopmentProvider(), "kaya ko ba 'to?", image=photo)
    text = "".join(e["data"]["text"] for e in events if e["event"] == "delta")
    assert text.startswith("I can't look at photos in basic mode")


# Web search ------------------------------------------------------------------------------------------------------------

def _sse(events: list[dict[str, Any]]) -> str:
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events)


async def test_claude_web_search_results_and_citations_come_through():
    events = [
        {"type": "content_block_start", "index": 0, "content_block": {"type": "server_tool_use", "id": "srv_1", "name": "web_search", "input": {}}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": "{\"query\": \"iPhone 17 Pro price Philippines\"}"}},
        {"type": "content_block_stop", "index": 0},
        {"type": "content_block_start", "index": 1, "content_block": {"type": "web_search_tool_result", "tool_use_id": "srv_1",
                                                                     "content": [{"type": "web_search_result", "url": "https://shop.example/iphone", "title": "iPhone 17 Pro", "encrypted_content": "x"}]}},
        {"type": "content_block_stop", "index": 1},
        {"type": "content_block_start", "index": 2, "content_block": {"type": "text", "text": ""}},
        {"type": "content_block_delta", "index": 2, "delta": {"type": "text_delta", "text": "It starts at ₱76,990."}},
        {"type": "content_block_delta", "index": 2, "delta": {"type": "citations_delta", "citation": {
            "type": "web_search_result_location", "url": "https://shop.example/iphone", "title": "iPhone 17 Pro", "cited_text": "Starts at ₱76,990"}}},
        {"type": "content_block_stop", "index": 2},
        {"type": "message_delta", "delta": {"stop_reason": "end_turn"}},
    ]
    seen: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, text=_sse(events), headers={"content-type": "text/event-stream"})

    provider = AnthropicProvider(Settings(ai_provider="anthropic", anthropic_api_key="sk-ant-test-not-real"))  # type: ignore[arg-type]
    provider._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider._loop = asyncio.get_running_loop()
    items = [i async for i in provider.stream_turn(system="s", transcript=[TranscriptItem("user", text="price?")], tools=[])]
    turn = items[-1]
    assert isinstance(turn, ModelTurn) and turn.text == "It starts at ₱76,990." and not turn.tool_calls
    assert turn.citations == [{"url": "https://shop.example/iphone", "title": "iPhone 17 Pro", "cited_text": "Starts at ₱76,990"}]
    assert [b["type"] for b in turn.raw] == ["server_tool_use", "web_search_tool_result", "text"]
    assert turn.raw[0]["input"] == {"query": "iPhone 17 Pro price Philippines"}
    assert any(t.get("type") == "web_search_20250305" for t in seen[0]["tools"])


async def test_without_web_search_enabled_claude_still_answers():
    calls: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body)
        if any(t.get("type") == "web_search_20250305" for t in body["tools"]):
            return httpx.Response(400, json={"type": "error", "error": {"type": "invalid_request_error",
                                                                        "message": "web_search is not enabled for this organization"}})
        return httpx.Response(200, text=_sse([
            {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}},
            {"type": "content_block_stop", "index": 0}]), headers={"content-type": "text/event-stream"})

    provider = AnthropicProvider(Settings(ai_provider="anthropic", anthropic_api_key="sk-ant-test-not-real"))  # type: ignore[arg-type]
    provider._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider._loop = asyncio.get_running_loop()
    items = [i async for i in provider.stream_turn(system="s", transcript=[TranscriptItem("user", text="hi")], tools=[])]
    assert isinstance(items[-1], ModelTurn) and items[-1].text == "Hello"
    assert provider.web_search is False and len(calls) == 2


# Phone check-ins ---------------------------------------------------------------------------------------------------------

async def test_daily_check_ins_go_out_once_and_gone_phones_are_dropped(app, monkeypatch):
    client, uid, account = await _person(app)
    key = (await client.get("/api/v1/push/key")).json()["public_key"]
    assert len(key) == 87 and key == (await client.get("/api/v1/push/key")).json()["public_key"]
    today = today_in("Asia/Manila")
    await client.post("/api/v1/recurring", json={"name": "Meralco", "kind": "bill", "amount_minor": 2_300 * P, "frequency": "monthly",
                                                 "next_due_on": today.isoformat(), "account_id": account["id"]})
    phone = f"https://push.example/{uuid.uuid4().hex}"
    assert (await client.post("/api/v1/push/subscriptions", json={"endpoint": phone, "keys": {"p256dh": "k" * 40, "auth": "a" * 16}})).status_code == 204

    sent: list[dict[str, Any]] = []
    status = {"code": 201}

    def fake_send(sub: Any, payload: dict[str, Any], pem: str) -> int:
        if sub.endpoint == phone:
            sent.append(payload)
        return status["code"] if sub.endpoint == phone else 201

    monkeypatch.setattr(push, "_send", fake_send)
    await push.send_daily_checkins()
    assert len(sent) == 1 and sent[0]["title"] == "Meralco ₱2,300 is due today" and sent[0]["url"].startswith("/assistant?q=")
    await push.send_daily_checkins()
    assert len(sent) == 1, "one check-in a day"

    status["code"] = 410
    await push.send_to_user(uid, {"title": "hi", "body": "", "url": "/assistant"})
    assert await push.send_to_user(uid, {"title": "hi", "body": "", "url": "/assistant"}) == 0, "the gone phone was removed"
    await client.aclose()
