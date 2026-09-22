import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.ai.assistant import service as assistant_service
from app.ai.assistant.snapshot import money_snapshot
from app.ai.providers.anthropic_provider import AnthropicProvider, _messages, _reason, _tools
from app.ai.providers.base import ModelTurn, ProviderUnavailable, TextDelta, ToolCall, TranscriptItem
from app.core.config import Settings
from app.core.db import scoped_session
from app.engine.periods import today_in
from app.models import UserSettings
from tests.conftest import make_user


class StreamingProvider:
    """Answers straight from the snapshot, streamed in pieces; a second scripted answer is used for repairs."""

    name = "streaming"
    is_development = False
    supports_vision = False

    def __init__(self, answers: list[str]):
        self.answers = answers

    async def assistant_turn(self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]) -> ModelTurn:
        raise AssertionError("streaming providers are streamed")

    async def stream_turn(self, *, system: str, transcript: list[TranscriptItem],
                          tools: list[dict[str, Any]]) -> AsyncIterator[TextDelta | ModelTurn]:
        answer = self.answers.pop(0)
        for i in range(0, len(answer), 7):
            yield TextDelta(answer[i:i + 7])
        yield ModelTurn(text=answer)


async def _user(app) -> tuple[uuid.UUID, UserSettings]:  # type: ignore[no-untyped-def]
    client = await make_user(app, "Streamer")
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    account = (await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 500_000})).json()
    await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 123_400, "occurred_on": today_in("Asia/Manila").isoformat(), "account_id": account["id"],
        "merchant": "Puregold"})
    await client.aclose()
    async with scoped_session(uid) as db:
        settings = await db.get(UserSettings, uid)
    assert settings is not None
    return uid, settings


async def _run(uid: uuid.UUID, settings: UserSettings, provider: StreamingProvider, question: str) -> list[dict[str, Any]]:
    original = assistant_service.get_llm
    assistant_service.get_llm = lambda: provider  # type: ignore[assignment]
    try:
        return [e async for e in assistant_service.stream_answer(uid, settings, today_in(settings.timezone), question, None, None)]
    finally:
        assistant_service.get_llm = original


async def test_answers_stream_live_and_snapshot_figures_pass(app):
    uid, settings = await _user(app)
    async with scoped_session(uid) as db:
        snapshot = await money_snapshot(db, uid, settings, today_in(settings.timezone))
    answer = f"You have {snapshot['total_balance']} across your accounts."
    events = await _run(uid, settings, StreamingProvider([answer]), "How much do I have?")
    names = [e["event"] for e in events]
    deltas = [e["data"]["text"] for e in events if e["event"] == "delta"]
    assert len(deltas) > 1, "the answer arrives in pieces as it is written"
    assert names.index("delta") < names.index("done")
    assert "".join(deltas) == answer
    assert "replace" not in names
    assert next(e["data"] for e in events if e["event"] == "done")["validation"] == "passed"


async def test_a_streamed_answer_with_invented_figures_is_replaced(app):
    uid, settings = await _user(app)
    async with scoped_session(uid) as db:
        snapshot = await money_snapshot(db, uid, settings, today_in(settings.timezone))
    provider = StreamingProvider(["You have ₱77,777 left.", f"You have {snapshot['total_balance']} left."])
    events = await _run(uid, settings, provider, "How much do I have?")
    replaced = next(e["data"]["text"] for e in events if e["event"] == "replace")
    assert "77,777" not in replaced and snapshot["total_balance"] in replaced
    assert next(e["data"] for e in events if e["event"] == "done")["validation"] == "repaired"


def test_claude_messages_alternate_and_group_tool_results():
    call_a, call_b = ToolCall("tu_1", "get_budget_status", {}), ToolCall("tu_2", "get_goal_progress", {})
    messages = _messages([
        TranscriptItem("user", text="How am I doing?"),
        TranscriptItem("model_output", raw=[{"type": "tool_use", "id": "tu_1", "name": "get_budget_status", "input": {}},
                                            {"type": "tool_use", "id": "tu_2", "name": "get_goal_progress", "input": {}}]),
        TranscriptItem("tool_result", call=call_a, output={"has_budget": False}),
        TranscriptItem("tool_result", call=call_b, output={"goals": []}),
    ])
    assert [m["role"] for m in messages] == ["user", "assistant", "user"]
    assert [b["tool_use_id"] for b in messages[2]["content"]] == ["tu_1", "tu_2"]
    tools = _tools([{"type": "function", "name": "a", "description": "d", "parameters": {"type": "object"}, "strict": True},
                    {"type": "function", "name": "b", "description": "d", "parameters": {"type": "object"}, "strict": True}])
    assert tools[0] == {"name": "a", "description": "d", "input_schema": {"type": "object"}}
    assert tools[-1]["cache_control"] == {"type": "ephemeral"}


async def test_claude_stream_yields_text_then_the_complete_turn():
    events = [
        {"type": "message_start", "message": {}},
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Checking "}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "budgets."}},
        {"type": "content_block_stop", "index": 0},
        {"type": "content_block_start", "index": 1, "content_block": {"type": "tool_use", "id": "tu_9", "name": "get_budget_status", "input": {}}},
        {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": "{\"month\": "}},
        {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": "null}"}},
        {"type": "content_block_stop", "index": 1},
        {"type": "message_stop"},
    ]
    body = "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events)
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = request.headers
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, text=body, headers={"content-type": "text/event-stream"})

    provider = AnthropicProvider(Settings(ai_provider="anthropic", anthropic_api_key="sk-ant-test-not-real"))  # type: ignore[arg-type]
    provider._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider._loop = asyncio.get_running_loop()
    items = [i async for i in provider.stream_turn(system="s", transcript=[TranscriptItem("user", text="hi")], tools=[])]
    assert [i.text for i in items if isinstance(i, TextDelta)] == ["Checking ", "budgets."]
    turn = items[-1]
    assert isinstance(turn, ModelTurn) and turn.text is None
    assert turn.tool_calls[0].name == "get_budget_status" and turn.tool_calls[0].arguments == {"month": None}
    assert seen["headers"]["anthropic-version"] == "2023-06-01" and seen["body"]["stream"] is True
    assert seen["body"]["model"] == "claude-sonnet-5"


def test_provider_choice_prefers_claude_and_keeps_openai_embeddings():
    both = Settings(ai_provider="auto", anthropic_api_key="a", openai_api_key="o")  # type: ignore[arg-type]
    assert both.resolved_ai_provider == "anthropic" and both.resolved_embedding_provider == "openai"
    claude_only = Settings(ai_provider="auto", anthropic_api_key="a", openai_api_key=None)  # type: ignore[arg-type]
    assert claude_only.resolved_ai_provider == "anthropic" and claude_only.resolved_embedding_provider == "local"
    neither = Settings(ai_provider="auto", anthropic_api_key=None, openai_api_key=None)  # type: ignore[arg-type]
    assert neither.resolved_ai_provider == "local"


class RefusingProvider:
    """Claude with no credits or a bad key: every call is refused."""

    name = "anthropic"
    is_development = False
    supports_vision = True

    async def assistant_turn(self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]) -> ModelTurn:
        raise ProviderUnavailable("The AI service is temporarily unavailable.")

    async def stream_turn(self, *, system: str, transcript: list[TranscriptItem],
                          tools: list[dict[str, Any]]) -> AsyncIterator[TextDelta | ModelTurn]:
        raise ProviderUnavailable("The AI service is temporarily unavailable.")
        yield TextDelta("")  # pragma: no cover


async def test_when_the_ai_service_refuses_faldo_still_answers_from_its_own_data(app):
    uid, settings = await _user(app)
    events = await _run(uid, settings, RefusingProvider(), "How much did I spend this month?")  # type: ignore[arg-type]
    text = "".join(e["data"]["text"] for e in events if e["event"] == "delta")
    done = next(e["data"] for e in events if e["event"] == "done")
    assert "temporarily unavailable" not in text
    assert "₱1,234" in text, "the local provider answered from the calculated spending"
    assert done["provider"] == "local" and done["validation"] != "unavailable"


def test_anthropic_refusal_reasons_are_readable():
    body = json.dumps({"type": "error", "error": {"type": "invalid_request_error",
                                                   "message": "Your credit balance is too low to access the Anthropic API."}}).encode()
    assert _reason(400, body) == "400 invalid_request_error: Your credit balance is too low to access the Anthropic API."
    assert _reason(502, b"<html>bad gateway</html>") == "502"
