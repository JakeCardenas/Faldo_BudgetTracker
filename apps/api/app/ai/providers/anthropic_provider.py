"""Claude (Anthropic Messages API) as Faldo's model, over plain HTTP.

Answers stream token by token (stream_turn) so the reply appears as it is written. Tool definitions and the
system prompt are marked for prompt caching, which makes every turn after the first faster and cheaper.
Capture and receipt reading use a forced tool call, so Claude returns JSON that matches the schema.
"""

import asyncio
import base64
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.ai.providers.base import CaptureContext, ModelTurn, ProviderUnavailable, TextDelta, ToolCall, TranscriptItem
from app.ai.providers.openai_provider import CAPTURE_INSTRUCTIONS, RECEIPT_INSTRUCTIONS, SUMMARY_INSTRUCTIONS
from app.ai.schemas import CAPTURE_SCHEMA, RECEIPT_SCHEMA
from app.core.config import Settings

logger = logging.getLogger("faldo.ai.anthropic")

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
CACHE = {"type": "ephemeral"}
UNAVAILABLE = "The AI service is temporarily unavailable."


def _reason(status: int, body: bytes) -> str:
    """Anthropic's own reason for a refusal (no credits, bad key, unknown model), for the server log."""
    try:
        error = json.loads(body).get("error", {})
        return f"{status} {error.get('type', 'error')}: {str(error.get('message', ''))[:200]}"
    except (ValueError, AttributeError):
        return str(status)


def _tools(specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Faldo's tool specs (OpenAI function format) as Claude tools; the last one carries the cache mark."""
    tools = [{"name": s["name"], "description": s["description"], "input_schema": s["parameters"]} for s in specs]
    if tools:
        tools[-1] = {**tools[-1], "cache_control": CACHE}
    return tools


def _messages(transcript: list[TranscriptItem]) -> list[dict[str, Any]]:
    """The transcript as alternating user and assistant messages, tool results grouped into one user turn."""
    messages: list[dict[str, Any]] = []

    def add(role: str, content: list[dict[str, Any]]) -> None:
        if not content:
            return
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"].extend(content)
        else:
            messages.append({"role": role, "content": content})

    for entry in transcript:
        if entry.kind == "user" and entry.text:
            add("user", [{"type": "text", "text": entry.text}])
        elif entry.kind == "assistant" and entry.text:
            add("assistant", [{"type": "text", "text": entry.text}])
        elif entry.kind == "model_output":
            add("assistant", list(entry.raw))
        elif entry.kind == "tool_result" and entry.call:
            add("user", [{"type": "tool_result", "tool_use_id": entry.call.id,
                          "content": json.dumps(entry.output, default=str, ensure_ascii=False)}])
    return messages


class AnthropicProvider:
    name = "anthropic"
    is_development = False
    supports_vision = True

    def __init__(self, settings: Settings):
        assert settings.anthropic_api_key is not None
        self._key = settings.anthropic_api_key.get_secret_value()
        self.chat_model = settings.anthropic_chat_model
        self.fast_model = settings.anthropic_fast_model
        self.vision_model = settings.anthropic_vision_model
        self._client: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def _http(self) -> httpx.AsyncClient:
        # One pooled client per event loop, so connections stay warm between turns.
        loop = asyncio.get_running_loop()
        if self._client is None or self._loop is not loop or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))
            self._loop = loop
        return self._client

    @property
    def _headers(self) -> dict[str, str]:
        return {"x-api-key": self._key, "anthropic-version": API_VERSION, "content-type": "application/json"}

    async def _create(self, body: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self._http().post(API_URL, headers=self._headers, json=body)
        except httpx.HTTPError as exc:
            logger.warning("Anthropic request failed: %s", exc.__class__.__name__)
            raise ProviderUnavailable(UNAVAILABLE) from exc
        if response.status_code >= 400:
            logger.warning("Anthropic request refused: %s", _reason(response.status_code, response.content))
            raise ProviderUnavailable(UNAVAILABLE)
        data: dict[str, Any] = response.json()
        return data

    async def stream_turn(
        self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]
    ) -> AsyncIterator[TextDelta | ModelTurn]:
        body = {
            "model": self.chat_model,
            "max_tokens": 2048,
            "system": [{"type": "text", "text": system, "cache_control": CACHE}],
            "messages": _messages(transcript),
            "tools": _tools(tools),
            "stream": True,
        }
        blocks: list[dict[str, Any]] = []
        try:
            async with self._http().stream("POST", API_URL, headers=self._headers, json=body) as response:
                if response.status_code >= 400:
                    refusal = await response.aread()
                    logger.warning("Anthropic assistant call refused: %s", _reason(response.status_code, refusal))
                    raise ProviderUnavailable(UNAVAILABLE)
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    event = json.loads(line[6:])
                    kind = event.get("type")
                    if kind == "content_block_start":
                        block = dict(event["content_block"])
                        if block.get("type") == "tool_use":
                            block["partial_json"] = ""
                        blocks.append(block)
                    elif kind == "content_block_delta":
                        delta = event["delta"]
                        block = blocks[event["index"]]
                        if delta.get("type") == "text_delta":
                            block["text"] = block.get("text", "") + delta["text"]
                            yield TextDelta(delta["text"])
                        elif delta.get("type") == "input_json_delta":
                            block["partial_json"] += delta.get("partial_json", "")
                    elif kind == "error":
                        error = event.get("error", {})
                        logger.warning("Anthropic stream error: %s: %s", error.get("type"), str(error.get("message", ""))[:200])
                        raise ProviderUnavailable(UNAVAILABLE)
        except httpx.HTTPError as exc:
            logger.warning("Anthropic stream failed: %s", exc.__class__.__name__)
            raise ProviderUnavailable(UNAVAILABLE) from exc

        calls: list[ToolCall] = []
        raw: list[dict[str, Any]] = []
        text: list[str] = []
        for block in blocks:
            if block.get("type") == "tool_use":
                try:
                    args = json.loads(block.get("partial_json") or "{}")
                except json.JSONDecodeError:
                    args = {}
                calls.append(ToolCall(id=block["id"], name=block["name"], arguments=args))
                raw.append({"type": "tool_use", "id": block["id"], "name": block["name"], "input": args})
            elif block.get("type") == "text" and block.get("text"):
                text.append(block["text"])
                raw.append({"type": "text", "text": block["text"]})
        yield ModelTurn(text="".join(text) if not calls else None, tool_calls=calls, raw=raw)

    async def assistant_turn(self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]) -> ModelTurn:
        final: ModelTurn | None = None
        async for item in self.stream_turn(system=system, transcript=transcript, tools=tools):
            if isinstance(item, ModelTurn):
                final = item
        if final is None:
            raise ProviderUnavailable(UNAVAILABLE)
        return final

    async def _structured(self, model: str, instructions: str, content: list[dict[str, Any]], name: str,
                          schema: dict[str, Any]) -> dict[str, Any]:
        data = await self._create({
            "model": model,
            "max_tokens": 4096,
            "system": instructions,
            "messages": [{"role": "user", "content": content}],
            "tools": [{"name": name, "description": "Record the result.", "input_schema": schema}],
            "tool_choice": {"type": "tool", "name": name},
        })
        for block in data.get("content", []):
            if block.get("type") == "tool_use" and isinstance(block.get("input"), dict):
                result: dict[str, Any] = block["input"]
                return result
        raise ProviderUnavailable(UNAVAILABLE)

    async def parse_transactions(self, text: str, context: CaptureContext) -> dict[str, Any] | None:
        payload = {
            "today": context.today,
            "currency": context.currency,
            "accounts": [a["name"] for a in context.accounts],
            "expense_categories": context.expense_categories,
            "income_categories": [c["name"] for c in context.income_categories],
            "known_merchants": context.known_merchants[:40],
            "note": text,
        }
        try:
            return await self._structured(self.fast_model, CAPTURE_INSTRUCTIONS,
                                          [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}],
                                          "record_transactions", CAPTURE_SCHEMA)
        except ProviderUnavailable:
            logger.warning("Anthropic capture parse failed")
            return None

    async def extract_receipt(self, image: bytes, mime_type: str, context: CaptureContext) -> dict[str, Any]:
        meta = {"today": context.today, "currency": context.currency,
                "categories": [c["name"] for c in context.expense_categories]}
        content: list[dict[str, Any]] = [
            {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": base64.b64encode(image).decode()}},
            {"type": "text", "text": json.dumps(meta)},
        ]
        try:
            return await self._structured(self.vision_model, RECEIPT_INSTRUCTIONS, content, "record_receipt", RECEIPT_SCHEMA)
        except ProviderUnavailable as exc:
            raise ProviderUnavailable("Receipt reading failed. Try again or enter the details manually.") from exc

    async def write_summary(self, kind: str, facts: dict[str, Any], draft: str) -> str | None:
        length = "One or two sentences, under 45 words." if kind == "pulse" else "Three to four sentences."
        try:
            data = await self._create({
                "model": self.fast_model,
                "max_tokens": 400,
                "system": SUMMARY_INSTRUCTIONS.format(length=length),
                "messages": [{"role": "user", "content": json.dumps({"draft": draft, "facts": facts}, default=str,
                                                                    ensure_ascii=False)}],
            })
        except ProviderUnavailable:
            return None
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        return text or None
