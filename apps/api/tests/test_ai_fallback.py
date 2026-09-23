"""Staying on free AI: each Gemini model's own free limit, a model that ran out handing over to the next, and Groq as
the free backup when every Gemini model is out."""

import asyncio
import json
import time
from typing import Any

import httpx
import pytest

from app.ai import factory
from app.ai.providers.base import ModelTurn, ProviderUnavailable, ToolCall, TranscriptItem
from app.ai.providers.compatible_provider import CompatibleProvider, rest_seconds
from app.core.config import Settings


def _sse(text: str) -> str:
    return f"data: {json.dumps({'choices': [{'index': 0, 'delta': {'content': text}}]})}\n\ndata: [DONE]\n\n"


def _wire(provider: CompatibleProvider, handler: Any) -> CompatibleProvider:
    provider._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider._loop = asyncio.get_running_loop()
    return provider


def _gemini(handler: Any, **settings: Any) -> CompatibleProvider:
    return _wire(CompatibleProvider.gemini(Settings(gemini_api_key="gm-test-not-real", **settings)), handler)  # type: ignore[arg-type]


def _groq(handler: Any) -> CompatibleProvider:
    return _wire(CompatibleProvider.groq(Settings(groq_api_key="gq-test-not-real")), handler)  # type: ignore[arg-type]


async def _ask(provider: CompatibleProvider, transcript: list[TranscriptItem] | None = None) -> ModelTurn:
    items = [i async for i in provider.stream_turn(system="s", transcript=transcript or [TranscriptItem("user", text="hi")], tools=[])]
    assert isinstance(items[-1], ModelTurn)
    return items[-1]


def test_how_long_a_model_waits_after_its_limit():
    per_minute = b'[{"error": {"code": 429, "message": "Quota exceeded.", "details": [{"retryDelay": "21s"}]}}]'
    assert rest_seconds({}, per_minute) == 21
    assert rest_seconds({"retry-after": "7"}, b"{}") == 7
    groq = b'{"error": {"message": "Rate limit reached on requests per day (RPD): Limit 1000. Please try again in 1m26.5s."}}'
    assert rest_seconds({}, groq) == pytest.approx(86.5)
    daily = b'{"error": {"message": "Quota exceeded for metric generate_content_free_tier_requests, GenerateRequestsPerDayPerProjectPerModel"}}'
    assert rest_seconds({}, daily) == 3600, "a daily limit without a time waits an hour"
    assert rest_seconds({}, b'{"error": {"message": "Resource has been exhausted"}}') == 60


async def test_a_model_that_ran_out_hands_over_to_the_next_gemini_model():
    models: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        models.append(body["model"])
        if len(models) == 1:
            return httpx.Response(429, json=[{"error": {"code": 429, "message": "Quota exceeded.", "details": [{"retryDelay": "30s"}]}}])
        return httpx.Response(200, text=_sse("Kaya mo 'yan."), headers={"content-type": "text/event-stream"})

    provider = _gemini(handler, gemini_chat_model="gemini-flash-latest", gemini_fallback_models="gemini-2.5-flash,gemini-2.5-flash-lite")
    turn = await _ask(provider)
    assert turn.text == "Kaya mo 'yan." and models == ["gemini-flash-latest", "gemini-2.5-flash"]
    assert not provider.is_resting(), "other models still have their free limits"
    await _ask(provider)
    assert models[-1] == "gemini-2.5-flash", "the one that ran out waits its 30 seconds"


async def test_every_model_out_rests_gemini_and_says_when():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json=[{"error": {"code": 429, "message": "Resource has been exhausted (e.g. check quota)."}}])

    provider = _gemini(handler, gemini_fallback_models="gemini-2.5-flash")
    with pytest.raises(ProviderUnavailable) as caught:
        await _ask(provider)
    assert "free limit" in (caught.value.hint or "") and provider.is_resting()


async def test_a_model_that_no_longer_exists_is_skipped_from_then_on():
    models: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        models.append(json.loads(request.content)["model"])
        if models[-1] == "gemini-old":
            return httpx.Response(404, json=[{"error": {"code": 404, "message": "models/gemini-old is not found for API version v1beta"}}])
        return httpx.Response(200, text=_sse("Okay."), headers={"content-type": "text/event-stream"})

    provider = _gemini(handler, gemini_chat_model="gemini-old", gemini_fallback_models="gemini-2.5-flash")
    await _ask(provider)
    await _ask(provider)
    assert models == ["gemini-old", "gemini-2.5-flash", "gemini-2.5-flash"]


async def test_a_bad_request_is_not_passed_down_the_models():
    models: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        models.append(json.loads(request.content)["model"])
        return httpx.Response(400, json=[{"error": {"code": 400, "message": "Invalid JSON payload received."}}])

    provider = _gemini(handler, gemini_fallback_models="gemini-2.5-flash")
    with pytest.raises(ProviderUnavailable):
        await _ask(provider)
    assert len(models) == 1 and not provider.is_resting()


def test_groq_backs_up_the_chosen_free_ai_but_paid_ones_never_step_in():
    keys = {"gemini_api_key": "g", "groq_api_key": "q", "anthropic_api_key": "a"}
    assert Settings(ai_provider="gemini", **keys).ai_provider_chain == ["gemini", "groq", "local"]  # type: ignore[arg-type]
    assert Settings(ai_provider="groq", **keys).ai_provider_chain == ["groq", "gemini", "local"]  # type: ignore[arg-type]
    assert Settings(ai_provider="gemini", gemini_api_key="g").ai_provider_chain == ["gemini", "local"]  # type: ignore[arg-type]
    assert Settings(ai_provider="auto", **keys).ai_provider_chain == ["anthropic", "gemini", "groq", "local"]  # type: ignore[arg-type]


def test_groq_answers_when_every_gemini_model_is_out(monkeypatch):
    settings = Settings(ai_provider="gemini", gemini_api_key="g", groq_api_key="q")  # type: ignore[arg-type]
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    factory._provider.cache_clear()
    try:
        gemini = factory._provider("gemini")
        assert isinstance(gemini, CompatibleProvider)
        assert factory.get_llm().name == "gemini"
        gemini.rest_until = time.monotonic() + 60
        assert factory.get_llm().name == "groq"
        assert [p.name for p in factory.vision_readers()] == ["gemini", "groq"]
    finally:
        factory._provider.cache_clear()


async def test_groq_reads_photos_with_a_vision_model_and_never_sees_gemini_only_fields():
    bodies: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(200, text=_sse("Nice receipt."), headers={"content-type": "text/event-stream"})

    provider = _groq(handler)
    gemini_turn = {"role": "assistant", "content": None, "tool_calls": [{"id": "fn_1", "type": "function",
                   "function": {"name": "get_balance", "arguments": "{}"}, "extra_content": {"google": {"thought_signature": "sig"}}}]}
    transcript = [TranscriptItem("user", text="What's this?", images=[{"media_type": "image/jpeg", "data": "AAAA"}]),
                  TranscriptItem("model_output", raw=[gemini_turn]),
                  TranscriptItem("tool_result", call=ToolCall(id="fn_1", name="get_balance", arguments={}), output={"ok": True})]
    await _ask(provider, transcript)
    body = bodies[0]
    assert body["model"] in provider.vision_models, "a photo in the chat goes to a model that can see it"
    sent_call = body["messages"][2]["tool_calls"][0]
    assert "extra_content" not in sent_call and sent_call["function"]["name"] == "get_balance"
    await _ask(provider)
    assert bodies[1]["model"] == provider.chat_models[0], "text-only chats use the chat model"
