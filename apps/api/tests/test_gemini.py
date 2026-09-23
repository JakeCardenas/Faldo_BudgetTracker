import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest

from app.ai import factory
from app.ai.assistant import service as assistant_service
from app.ai.providers.anthropic_provider import AnthropicProvider
from app.ai.providers.base import ModelTurn, ProviderUnavailable, TextDelta, ToolCall, TranscriptItem
from app.ai.providers.compatible_provider import CompatibleProvider, _messages, plain_schema
from app.core.config import Settings
from app.core.db import scoped_session
from app.engine.periods import today_in
from app.models import UserSettings
from tests.test_ai_streaming import _user


def _gemini(handler: Any) -> CompatibleProvider:
    provider = CompatibleProvider.gemini(Settings(gemini_api_key="gm-test-not-real"))  # type: ignore[arg-type]
    provider._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider._loop = asyncio.get_running_loop()
    return provider


def _sse(chunks: list[dict[str, Any]]) -> str:
    return "".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n"


def test_strict_tool_schemas_are_made_plain_for_gemini():
    strict = {"type": "object", "additionalProperties": False, "required": ["item", "price", "ideas"], "properties": {
        "item": {"type": "string"}, "price": {"type": ["number", "null"], "description": "Price"},
        "ideas": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["name", "category"],
                                              "properties": {"name": {"type": "string"},
                                                             "category": {"type": ["string", "null"], "enum": ["a", None]}}}}}}
    plain = plain_schema(strict)
    assert plain["required"] == ["item", "ideas"] and "additionalProperties" not in plain
    assert plain["properties"]["price"] == {"type": "number", "description": "Price"}
    idea = plain["properties"]["ideas"]["items"]
    assert idea["required"] == ["name"] and idea["properties"]["category"] == {"type": "string", "enum": ["a"]}


async def test_gemini_streams_text_and_tool_calls_and_keeps_thought_signatures():
    chunks = [
        {"choices": [{"index": 0, "delta": {"role": "assistant", "tool_calls": [
            {"index": 0, "id": "fn_1", "type": "function", "function": {"name": "calculate_affordability", "arguments": "{\"amount\": 44"},
             "extra_content": {"google": {"thought_signature": "sig-abc"}}}]}}]},
        {"choices": [{"index": 0, "delta": {"tool_calls": [{"index": 0, "function": {"arguments": "96}"}}]}}]},
        {"choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]},
    ]
    seen: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        assert request.headers["authorization"] == "Bearer gm-test-not-real"
        return httpx.Response(200, text=_sse(chunks), headers={"content-type": "text/event-stream"})

    provider = _gemini(handler)
    photo = {"media_type": "image/jpeg", "data": "QUJD"}
    items = [i async for i in provider.stream_turn(system="s", transcript=[TranscriptItem("user", text="kaya ko ba to?", images=[photo])],
                                                   tools=[{"type": "function", "name": "calculate_affordability", "description": "d",
                                                           "parameters": {"type": "object", "properties": {}}, "strict": True}])]
    turn = items[-1]
    assert isinstance(turn, ModelTurn) and turn.text is None
    assert turn.tool_calls == [ToolCall("fn_1", "calculate_affordability", {"amount": 4496})]
    assert turn.raw[0]["tool_calls"][0]["extra_content"] == {"google": {"thought_signature": "sig-abc"}}
    body = seen[0]
    assert body["model"] == "gemini-flash-latest" and body["stream"] is True
    assert body["messages"][1]["content"][1] == {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,QUJD"}}
    assert body["tools"][0]["function"]["name"] == "calculate_affordability"

    # The tool call goes back with its signature, and the result follows as a tool message.
    messages = _messages("s", [TranscriptItem("user", text="hi"), TranscriptItem("model_output", raw=turn.raw),
                               TranscriptItem("tool_result", call=turn.tool_calls[0], output={"ok": True})])
    assert messages[2]["tool_calls"][0]["extra_content"]["google"]["thought_signature"] == "sig-abc"
    assert messages[3] == {"role": "tool", "tool_call_id": "fn_1", "content": "{\"ok\": true}"}


async def test_a_used_up_free_limit_rests_gemini_and_says_so():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json=[{"error": {"code": 429, "message": "Resource has been exhausted (e.g. check quota)."}}])

    provider = _gemini(handler)
    with pytest.raises(ProviderUnavailable) as caught:
        [i async for i in provider.stream_turn(system="s", transcript=[TranscriptItem("user", text="hi")], tools=[])]
    assert "free limit" in (caught.value.hint or "") and provider.is_resting()


def test_a_chosen_ai_is_the_only_one_used():
    both = {"anthropic_api_key": "a", "gemini_api_key": "g"}
    assert Settings(ai_provider="gemini", **both).ai_provider_chain == ["gemini", "local"]  # type: ignore[arg-type]
    assert Settings(ai_provider="auto", **both).ai_provider_chain == ["anthropic", "gemini", "local"]  # type: ignore[arg-type]
    assert Settings(ai_provider="auto", gemini_api_key="g").resolved_ai_provider == "gemini"  # type: ignore[arg-type]
    assert Settings(ai_provider="Gemini ", **both).ai_provider_chain == ["gemini", "local"]  # type: ignore[arg-type]
    assert Settings(ai_provider="gemini", anthropic_api_key="a").ai_provider_chain == ["anthropic", "local"], "no key, no Gemini"  # type: ignore[arg-type]


def test_claude_without_credits_rests_instead_of_failing_every_answer():
    provider = AnthropicProvider(Settings(ai_provider="anthropic", anthropic_api_key="sk-ant-test-not-real"))  # type: ignore[arg-type]
    body = json.dumps({"error": {"type": "invalid_request_error", "message": "Your credit balance is too low to access the Anthropic API."}})
    error = provider._refusal(400, body.encode())
    assert provider.is_resting() and "no API credits" in (error.hint or "")
    busy = AnthropicProvider(Settings(ai_provider="anthropic", anthropic_api_key="sk-ant-test-not-real"))  # type: ignore[arg-type]
    busy._refusal(529, b'{"error": {"type": "overloaded_error", "message": "Overloaded"}}')
    assert not busy.is_resting(), "a busy moment isn't a reason to skip Claude"


class Scripted:
    def __init__(self, name: str, answer: str | None) -> None:
        self.name, self.answer = name, answer
        self.is_development, self.supports_vision = False, True
        self.rest_until = 0.0

    def is_resting(self) -> bool:
        return time.monotonic() < self.rest_until

    async def assistant_turn(self, **_: Any) -> ModelTurn:
        raise AssertionError("streamed")

    async def stream_turn(self, *, system: str, transcript: list[TranscriptItem],
                          tools: list[dict[str, Any]]) -> AsyncIterator[TextDelta | ModelTurn]:
        if self.answer is None:
            self.rest_until = time.monotonic() + 60
            raise ProviderUnavailable("The AI service is temporarily unavailable.", "Claude isn't answering: no API credits.")
        yield TextDelta(self.answer)
        yield ModelTurn(text=self.answer)


async def test_when_one_ai_refuses_the_next_one_answers_without_a_basic_note(app, monkeypatch):
    uid, settings = await _user(app)
    claude, gemini = Scripted("anthropic", None), Scripted("gemini", "Kaya mo 'yan, pero bantayan ang Food budget.")
    monkeypatch.setattr(assistant_service, "get_llm", lambda: claude)
    monkeypatch.setattr(assistant_service, "next_llm", lambda after: gemini if after == "anthropic" else factory._provider("local"))
    events = [e async for e in assistant_service.stream_answer(uid, settings, today_in(settings.timezone), "Kaya ko ba?", None, None)]
    done = next(e["data"] for e in events if e["event"] == "done")
    text = "".join(e["data"]["text"] for e in events if e["event"] == "delta")
    assert done["provider"] == "gemini" and "fallback_hint" not in done and text.startswith("Kaya mo")


async def test_basic_mode_asks_for_the_price_when_it_cannot_read_a_photo(app, monkeypatch):
    uid, settings = await _user(app)
    monkeypatch.setattr(assistant_service, "get_llm", lambda: factory._provider("local"))
    async with scoped_session(uid) as db:
        assert await db.get(UserSettings, uid) is not None
    events = [e async for e in assistant_service.stream_answer(uid, settings, today_in(settings.timezone),
                                                               "kaya ko ba to sa birthday ko october 14?", None, None,
                                                               {"media_type": "image/jpeg", "data": "A" * 200})]
    text = "".join(e["data"]["text"] for e in events if e["event"] == "delta")
    assert text.startswith("I can't read photos in basic mode. Type the price") and "Samsung" not in text
    assert uuid.UUID(next(e["data"]["id"] for e in events if e["event"] == "conversation"))


def test_every_faldo_tool_is_described_the_way_gemini_accepts():
    import app.ai.tools.definitions  # noqa: F401
    from app.ai.providers.compatible_provider import GEMINI_KEYS, _tools
    from app.ai.tools.registry import tool_specs

    tools = {t["function"]["name"]: t["function"] for t in _tools(tool_specs())}
    assert "parameters" not in tools["get_current_balance"] and "parameters" not in tools["get_challenges"]

    def keys(node: Any) -> set[str]:
        if isinstance(node, list):
            return set().union(*(keys(v) for v in node)) if node else set()
        if not isinstance(node, dict):
            return set()
        found = set(node) - {"properties"}
        for name, value in node.items():
            found |= set().union(*(keys(v) for v in value.values())) if name == "properties" else keys(value)
        return found

    used = set().union(*(keys(fn.get("parameters", {})) for fn in tools.values()))
    assert used <= GEMINI_KEYS, used - GEMINI_KEYS
    for fn in tools.values():
        params = fn.get("parameters")
        if params:
            assert params["type"] == "object" and params["properties"], fn["name"]


async def test_a_brief_gemini_overload_is_retried_once():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, json={"error": {"code": 503, "message": "The model is overloaded. Please try again later."}})
        return httpx.Response(200, text=_sse([{"choices": [{"index": 0, "delta": {"content": "Kaya mo 'yan."}}]}]),
                              headers={"content-type": "text/event-stream"})

    provider = _gemini(handler)
    items = [i async for i in provider.stream_turn(system="s", transcript=[TranscriptItem("user", text="hi")], tools=[])]
    assert calls["n"] == 2 and isinstance(items[-1], ModelTurn) and items[-1].text == "Kaya mo 'yan."


async def test_gemini_errors_say_what_went_wrong():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json=[{"error": {"code": 400, "message": "Invalid JSON payload received. Unknown name \"pattern\"."}}])

    provider = _gemini(handler)
    with pytest.raises(ProviderUnavailable) as caught:
        [i async for i in provider.stream_turn(system="s", transcript=[TranscriptItem("user", text="hi")], tools=[])]
    assert "error 400: Invalid JSON payload received" in (caught.value.hint or "") and not provider.is_resting()
