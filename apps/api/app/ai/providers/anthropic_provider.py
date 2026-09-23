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


def _hint(status: int, body: bytes) -> str:
    """Why Claude refused, in plain words and with the fix, shown under answers Faldo gave without it."""
    try:
        error = json.loads(body).get("error", {})
    except (ValueError, AttributeError):
        error = {}
    kind, message = str(error.get("type", "")), str(error.get("message", "")).lower()
    if "credit balance" in message:
        return "Claude isn't answering: the Anthropic account has no API credits. Add credits in the Anthropic Console under Billing."
    if status == 401 or kind == "authentication_error":
        return "Claude isn't answering: ANTHROPIC_API_KEY isn't valid. Create a new key in the Anthropic Console, update it in Vercel and redeploy."
    if status == 403 or kind == "permission_error":
        return "Claude isn't answering: this API key isn't allowed to use the model."
    if status == 404 or kind == "not_found_error":
        return "Claude isn't answering: the model isn't available to this API key."
    if status == 429 or kind == "rate_limit_error":
        return "Claude is getting too many requests right now. Try again in a minute."
    if status >= 500 or kind in {"overloaded_error", "api_error"}:
        return "Claude is busy right now. Try again shortly."
    return f"Claude refused the request ({kind or status})."


NETWORK_HINT = "Faldo couldn't reach Claude. Try again shortly."
# Claude searches the web itself for current prices, rates and news (billed per search by Anthropic).
WEB_SEARCH = {"type": "web_search_20250305", "name": "web_search", "max_uses": 3,
              "user_location": {"type": "approximate", "country": "PH", "timezone": "Asia/Manila"}}


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
        if entry.kind == "user" and entry.images:
            add("user", [*({"type": "image", "source": {"type": "base64", "media_type": i["media_type"], "data": i["data"]}}
                           for i in entry.images), {"type": "text", "text": entry.text or "What can you tell me about this?"}])
        elif entry.kind == "user" and entry.text:
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
        self.web_search = settings.ai_web_search

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
            raise ProviderUnavailable(UNAVAILABLE, NETWORK_HINT) from exc
        if response.status_code >= 400:
            logger.warning("Anthropic request refused: %s", _reason(response.status_code, response.content))
            raise ProviderUnavailable(UNAVAILABLE, _hint(response.status_code, response.content))
        data: dict[str, Any] = response.json()
        return data

    async def stream_turn(
        self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]
    ) -> AsyncIterator[TextDelta | ModelTurn]:
        search = self.web_search
        body = {
            "model": self.chat_model,
            "max_tokens": 2048,
            "system": [{"type": "text", "text": system, "cache_control": CACHE}],
            "messages": _messages(transcript),
            "tools": [*_tools(tools), *([WEB_SEARCH] if search else [])],
            "stream": True,
        }
        blocks: list[dict[str, Any]] = []
        citations: list[dict[str, Any]] = []
        stop_reason: str | None = None
        try:
            async with self._http().stream("POST", API_URL, headers=self._headers, json=body) as response:
                if response.status_code >= 400:
                    refusal = await response.aread()
                    if search and response.status_code == 400 and b"web_search" in refusal:
                        # Web search isn't turned on for this Anthropic organization: answer without it from now on.
                        logger.warning("Anthropic web search unavailable, continuing without it: %s", _reason(400, refusal))
                        self.web_search = False
                        async for item in self.stream_turn(system=system, transcript=transcript, tools=tools):
                            yield item
                        return
                    logger.warning("Anthropic assistant call refused: %s", _reason(response.status_code, refusal))
                    raise ProviderUnavailable(UNAVAILABLE, _hint(response.status_code, refusal))
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    event = json.loads(line[6:])
                    kind = event.get("type")
                    if kind == "content_block_start":
                        block = dict(event["content_block"])
                        if block.get("type") in {"tool_use", "server_tool_use"}:
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
                        elif delta.get("type") == "citations_delta":
                            citation = delta.get("citation", {})
                            block.setdefault("citations", []).append(citation)
                            citations.append({"url": citation.get("url"), "title": citation.get("title"),
                                              "cited_text": citation.get("cited_text", "")})
                    elif kind == "message_delta":
                        stop_reason = event.get("delta", {}).get("stop_reason") or stop_reason
                    elif kind == "error":
                        error = event.get("error", {})
                        logger.warning("Anthropic stream error: %s: %s", error.get("type"), str(error.get("message", ""))[:200])
                        raise ProviderUnavailable(UNAVAILABLE, _hint(500, json.dumps(event).encode()))
        except httpx.HTTPError as exc:
            logger.warning("Anthropic stream failed: %s", exc.__class__.__name__)
            raise ProviderUnavailable(UNAVAILABLE, NETWORK_HINT) from exc

        calls: list[ToolCall] = []
        raw: list[dict[str, Any]] = []
        text: list[str] = []
        for block in blocks:
            if block.get("type") in {"tool_use", "server_tool_use"}:
                try:
                    args = json.loads(block.get("partial_json") or "{}")
                except json.JSONDecodeError:
                    args = {}
                raw.append({"type": block["type"], "id": block["id"], "name": block["name"], "input": args})
                if block["type"] == "tool_use":
                    calls.append(ToolCall(id=block["id"], name=block["name"], arguments=args))
            elif block.get("type") == "web_search_tool_result":
                raw.append({k: v for k, v in block.items() if k in {"type", "tool_use_id", "content"}})
            elif block.get("type") == "text" and block.get("text"):
                text.append(block["text"])
                raw.append({"type": "text", "text": block["text"], **({"citations": block["citations"]} if block.get("citations") else {})})
        paused = stop_reason == "pause_turn" and not calls
        yield ModelTurn(text="".join(text) if not calls and not paused else None, tool_calls=calls, raw=raw, paused=paused,
                        citations=citations)

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

    async def summarize_conversation(self, prompt: str) -> str | None:
        try:
            data = await self._create({"model": self.fast_model, "max_tokens": 250,
                                       "messages": [{"role": "user", "content": prompt}]})
        except ProviderUnavailable:
            return None
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        return text or None

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
