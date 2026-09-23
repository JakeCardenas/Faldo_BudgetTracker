"""Any model behind an OpenAI-compatible Chat Completions API, over plain HTTP. Faldo uses it for Google's Gemini.

Gemini has a free tier (unpaid quota in Google AI Studio) that reads photos, calls tools and streams, so Faldo can be a
real chatbot without paying for Claude. On the free tier Google may use prompts and answers to improve its products,
and human reviewers may read them; a paid Gemini key or Claude avoids that.

Tool schemas are simplified for Gemini: optional fields are left out of "required" rather than typed as nullable, and
any extra data Gemini attaches to a tool call (Gemini 3's thought signatures) is sent back exactly as it came.
"""

import asyncio
import base64
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.ai.providers.base import CaptureContext, ModelTurn, ProviderUnavailable, TextDelta, ToolCall, TranscriptItem
from app.ai.providers.openai_provider import CAPTURE_INSTRUCTIONS, RECEIPT_INSTRUCTIONS, SUMMARY_INSTRUCTIONS
from app.ai.schemas import CAPTURE_SCHEMA, RECEIPT_SCHEMA
from app.core.config import Settings

logger = logging.getLogger("faldo.ai.compatible")
UNAVAILABLE = "The AI service is temporarily unavailable."
REST_SECONDS = {"quota": 10 * 60, "key": 30 * 60}
RETRY_STATUSES = {500, 502, 503, 504}


def _error_message(body: bytes) -> str:
    """Gemini's own words for an error, whichever shape it comes in."""
    try:
        error: Any = json.loads(body)
    except ValueError:
        return body.decode("utf-8", "ignore")[:200].strip()
    if isinstance(error, list) and error:
        error = error[0]
    if isinstance(error, dict):
        inner = error.get("error", error)
        if isinstance(inner, dict):
            return str(inner.get("message", ""))[:200]
    return ""


def plain_schema(node: Any) -> Any:
    """A strict JSON schema made plain: no additionalProperties, and nullable fields become optional ones."""
    if isinstance(node, list):
        return [plain_schema(v) for v in node]
    if not isinstance(node, dict):
        return node
    out = {k: plain_schema(v) for k, v in node.items() if k not in {"additionalProperties", "strict", "title", "default"}}
    kind = out.get("type")
    if isinstance(kind, list):
        real = [k for k in kind if k != "null"]
        out["type"] = real[0] if real else "string"
    if "enum" in out:
        out["enum"] = [e for e in out["enum"] if e is not None]
    if "properties" in node and "required" in node:
        nullable = {name for name, spec in node["properties"].items()
                    if isinstance(spec, dict) and isinstance(spec.get("type"), list) and "null" in spec["type"]}
        out["required"] = [name for name in node["required"] if name not in nullable]
        if not out["required"]:
            out.pop("required")
    return out


# Gemini reads a subset of JSON Schema (OpenAPI 3.0 style); anything else can make it reject the whole request.
GEMINI_KEYS = {"type", "description", "enum", "properties", "required", "items", "minimum", "maximum", "minItems",
               "maxItems", "nullable", "format"}


def gemini_schema(node: Any) -> Any:
    """Keep only what Gemini understands: exclusive bounds become plain ones, other keywords are dropped."""
    if isinstance(node, list):
        return [gemini_schema(v) for v in node]
    if not isinstance(node, dict):
        return node
    out: dict[str, Any] = {}
    for key, value in node.items():
        if key == "properties" and isinstance(value, dict):
            out[key] = {name: gemini_schema(spec) for name, spec in value.items()}
        elif key in {"exclusiveMinimum", "exclusiveMaximum"} and isinstance(value, int | float):
            out.setdefault("minimum" if key == "exclusiveMinimum" else "maximum", value)
        elif key in GEMINI_KEYS:
            out[key] = gemini_schema(value)
    if out.get("format") not in {None, "date-time", "enum", "int32", "int64", "float", "double"}:
        out.pop("format")
    return out


def _function(name: str, description: str, parameters: dict[str, Any]) -> dict[str, Any]:
    schema = gemini_schema(plain_schema(parameters))
    fn: dict[str, Any] = {"name": name, "description": description}
    if schema.get("properties"):
        fn["parameters"] = schema  # a tool without inputs has no parameters at all; Gemini rejects an empty object
    return {"type": "function", "function": fn}


def _tools(specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_function(s["name"], s["description"], s["parameters"]) for s in specs]


def _messages(system: str, transcript: list[TranscriptItem]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for entry in transcript:
        if entry.kind == "user" and entry.images:
            messages.append({"role": "user", "content": [
                {"type": "text", "text": entry.text or "What can you tell me about this?"},
                *({"type": "image_url", "image_url": {"url": f"data:{i['media_type']};base64,{i['data']}"}} for i in entry.images),
            ]})
        elif entry.kind == "user" and entry.text:
            messages.append({"role": "user", "content": entry.text})
        elif entry.kind == "assistant" and entry.text:
            messages.append({"role": "assistant", "content": entry.text})
        elif entry.kind == "model_output":
            messages.extend(entry.raw)
        elif entry.kind == "tool_result" and entry.call:
            messages.append({"role": "tool", "tool_call_id": entry.call.id,
                             "content": json.dumps(entry.output, default=str, ensure_ascii=False)})
    return messages


def _merge(target: dict[str, Any], delta: dict[str, Any]) -> None:
    """Fold one streamed tool-call fragment into the call: arguments are appended, anything else is kept."""
    for key, value in delta.items():
        if key == "index":
            continue
        if key == "function" and isinstance(value, dict):
            fn = target.setdefault("function", {"name": "", "arguments": ""})
            if value.get("name"):
                fn["name"] = value["name"]
            if value.get("arguments"):
                fn["arguments"] = fn.get("arguments", "") + value["arguments"]
        elif isinstance(value, dict) and isinstance(target.get(key), dict):
            target[key].update(value)
        elif value is not None:
            target[key] = value


class CompatibleProvider:
    """Gemini (or another OpenAI-compatible service) as Faldo's model."""

    is_development = False
    supports_vision = True

    def __init__(self, *, name: str, label: str, base_url: str, api_key: str, chat_model: str, fast_model: str):
        self.name = name
        self.label = label
        self.base_url = base_url.rstrip("/")
        self._key = api_key
        self.chat_model = chat_model
        self.fast_model = fast_model
        self._client: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self.rest_until = 0.0

    @classmethod
    def gemini(cls, settings: Settings) -> "CompatibleProvider":
        assert settings.gemini_api_key is not None
        return cls(name="gemini", label="Gemini", base_url=settings.gemini_base_url,
                   api_key=settings.gemini_api_key.get_secret_value(), chat_model=settings.gemini_chat_model,
                   fast_model=settings.gemini_fast_model)

    def is_resting(self) -> bool:
        return time.monotonic() < self.rest_until

    def _http(self) -> httpx.AsyncClient:
        loop = asyncio.get_running_loop()
        if self._client is None or self._loop is not loop or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))
            self._loop = loop
        return self._client

    @property
    def _headers(self) -> dict[str, str]:
        return {"authorization": f"Bearer {self._key}", "content-type": "application/json"}

    def _refused(self, status: int, body: bytes) -> ProviderUnavailable:
        message = _error_message(body)
        logger.warning("%s request refused: %s %s", self.label, status, message)
        if status == 429:
            self.rest_until = time.monotonic() + REST_SECONDS["quota"]
            hint = f"{self.label}'s free limit is used up for now. Faldo will try it again in a few minutes."
        elif status in {401, 403} or "api key" in message.lower():
            self.rest_until = time.monotonic() + REST_SECONDS["key"]
            hint = f"{self.label} isn't answering: the API key isn't valid. Check GEMINI_API_KEY in Vercel."
        elif status == 404:
            hint = f"{self.label} couldn't find the model ({message[:90] or 'not found'}). Check GEMINI_CHAT_MODEL."
        elif status >= 500:
            hint = f"{self.label} had a problem answering (error {status}{': ' + message[:90] if message else ''}). Try again shortly."
        else:
            hint = f"{self.label} refused the request (error {status}{': ' + message[:120] if message else ''})."
        return ProviderUnavailable(UNAVAILABLE, hint)

    async def _post_stream(self, body: dict[str, Any]) -> Any:
        """Open the stream, retrying once when Gemini is briefly overloaded (500/503)."""
        for attempt in range(2):
            request = self._http().build_request("POST", f"{self.base_url}/chat/completions", headers=self._headers, json=body)
            response = await self._http().send(request, stream=True)
            if response.status_code in RETRY_STATUSES and attempt == 0:
                await response.aclose()
                await asyncio.sleep(1.2)
                continue
            return response
        return response

    async def stream_turn(self, *, system: str, transcript: list[TranscriptItem],
                          tools: list[dict[str, Any]]) -> AsyncIterator[TextDelta | ModelTurn]:
        body: dict[str, Any] = {"model": self.chat_model, "messages": _messages(system, transcript), "stream": True}
        if tools:
            body["tools"] = _tools(tools)
        text: list[str] = []
        calls: dict[int, dict[str, Any]] = {}
        try:
            response = await self._post_stream(body)
            try:
                if response.status_code >= 400:
                    raise self._refused(response.status_code, await response.aread())
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    chunk = json.loads(data)
                    if isinstance(chunk, list):
                        chunk = chunk[0] if chunk else {}
                    if chunk.get("error"):
                        message = _error_message(json.dumps(chunk).encode())
                        logger.warning("%s stream error: %s", self.label, message)
                        raise ProviderUnavailable(UNAVAILABLE, f"{self.label} had a problem answering ({message[:90] or 'stream error'}). "
                                                               "Try again shortly.")
                    for choice in chunk.get("choices", []):
                        delta = choice.get("delta") or {}
                        if delta.get("content"):
                            text.append(delta["content"])
                            yield TextDelta(delta["content"])
                        for part in delta.get("tool_calls") or []:
                            _merge(calls.setdefault(int(part.get("index", len(calls))), {"type": "function"}), part)
            finally:
                await response.aclose()
        except httpx.HTTPError as exc:
            logger.warning("%s stream failed: %s", self.label, exc.__class__.__name__)
            raise ProviderUnavailable(UNAVAILABLE, f"Faldo couldn't reach {self.label}. Try again shortly.") from exc

        tool_calls: list[ToolCall] = []
        raw_calls: list[dict[str, Any]] = []
        for i, call in sorted(calls.items()):
            call.setdefault("id", f"call_{i}")
            if not call["id"]:
                call["id"] = f"call_{i}"
            fn = call.get("function", {})
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(ToolCall(id=call["id"], name=fn.get("name", ""), arguments=args if isinstance(args, dict) else {}))
            raw_calls.append(call)
        content = "".join(text)
        raw: dict[str, Any] = {"role": "assistant", "content": content or None}
        if raw_calls:
            raw["tool_calls"] = raw_calls
        yield ModelTurn(text=content if not tool_calls else None, tool_calls=tool_calls, raw=[raw])

    async def assistant_turn(self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]) -> ModelTurn:
        final: ModelTurn | None = None
        async for item in self.stream_turn(system=system, transcript=transcript, tools=tools):
            if isinstance(item, ModelTurn):
                final = item
        if final is None:
            raise ProviderUnavailable(UNAVAILABLE)
        return final

    async def _complete(self, body: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self._http().post(f"{self.base_url}/chat/completions", headers=self._headers, json=body)
            if response.status_code in RETRY_STATUSES:
                await asyncio.sleep(1.2)
                response = await self._http().post(f"{self.base_url}/chat/completions", headers=self._headers, json=body)
        except httpx.HTTPError as exc:
            raise ProviderUnavailable(UNAVAILABLE) from exc
        if response.status_code >= 400:
            raise self._refused(response.status_code, response.content)
        data: dict[str, Any] = response.json()
        return data

    async def _structured(self, instructions: str, content: Any, name: str, schema: dict[str, Any]) -> dict[str, Any]:
        data = await self._complete({
            "model": self.chat_model,
            "messages": [{"role": "system", "content": instructions}, {"role": "user", "content": content}],
            "tools": [_function(name, "Record the result.", schema)],
            "tool_choice": {"type": "function", "function": {"name": name}},
        })
        for choice in data.get("choices", []):
            for call in (choice.get("message") or {}).get("tool_calls") or []:
                try:
                    result = json.loads(call.get("function", {}).get("arguments") or "{}")
                except json.JSONDecodeError:
                    continue
                if isinstance(result, dict):
                    return result
        raise ProviderUnavailable(UNAVAILABLE)

    async def parse_transactions(self, text: str, context: CaptureContext) -> dict[str, Any] | None:
        payload = {"today": context.today, "currency": context.currency, "accounts": [a["name"] for a in context.accounts],
                   "expense_categories": context.expense_categories, "income_categories": [c["name"] for c in context.income_categories],
                   "known_merchants": context.known_merchants[:40], "note": text}
        try:
            return await self._structured(CAPTURE_INSTRUCTIONS, json.dumps(payload, ensure_ascii=False), "record_transactions", CAPTURE_SCHEMA)
        except ProviderUnavailable:
            return None

    async def extract_receipt(self, image: bytes, mime_type: str, context: CaptureContext) -> dict[str, Any]:
        meta = {"today": context.today, "currency": context.currency, "categories": [c["name"] for c in context.expense_categories]}
        content = [{"type": "text", "text": json.dumps(meta)},
                   {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64.b64encode(image).decode()}"}}]
        try:
            return await self._structured(RECEIPT_INSTRUCTIONS, content, "record_receipt", RECEIPT_SCHEMA)
        except ProviderUnavailable as exc:
            raise ProviderUnavailable("Receipt reading failed. Try again or enter the details manually.") from exc

    async def _text(self, messages: list[dict[str, Any]]) -> str | None:
        try:
            data = await self._complete({"model": self.fast_model, "messages": messages})
        except ProviderUnavailable:
            return None
        choices = data.get("choices") or [{}]
        text = str((choices[0].get("message") or {}).get("content") or "").strip()
        return text or None

    async def write_summary(self, kind: str, facts: dict[str, Any], draft: str) -> str | None:
        length = "One or two sentences, under 45 words." if kind == "pulse" else "Three to four sentences."
        return await self._text([{"role": "system", "content": SUMMARY_INSTRUCTIONS.format(length=length)},
                                 {"role": "user", "content": json.dumps({"draft": draft, "facts": facts}, default=str, ensure_ascii=False)}])

    async def summarize_conversation(self, prompt: str) -> str | None:
        return await self._text([{"role": "user", "content": prompt}])
