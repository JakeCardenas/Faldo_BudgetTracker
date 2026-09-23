"""Any model behind an OpenAI-compatible Chat Completions API, over plain HTTP. Faldo uses it for Google's Gemini and,
as the free backup, Groq.

Gemini has a free tier (unpaid quota in Google AI Studio) that reads photos, calls tools and streams, so Faldo can be a
real chatbot without paying for Claude. On the free tier Google may use prompts and answers to improve its products,
and human reviewers may read them; a paid Gemini key or Claude avoids that.

Free limits are per model, so each job has a list of models. One that runs out waits as long as the service says
(seconds for a per-minute limit, an hour for a daily one) while the next answers; one that no longer exists is skipped
from then on. Only when every model is out does the provider rest, and Faldo moves to the next provider.

Tool schemas are simplified for Gemini: optional fields are left out of "required" rather than typed as nullable, and
any extra data Gemini attaches to a tool call (Gemini 3's thought signatures) is sent back exactly as it came.
"""

import asyncio
import base64
import json
import logging
import re
import time
from collections.abc import AsyncIterator, Mapping
from typing import Any

import httpx

from app.ai.providers.base import CaptureContext, ModelTurn, ProviderUnavailable, TextDelta, ToolCall, TranscriptItem
from app.ai.providers.openai_provider import (
    CAPTURE_INSTRUCTIONS,
    RECEIPT_INSTRUCTIONS,
    SUMMARY_INSTRUCTIONS,
    receipt_meta,
)
from app.ai.schemas import CAPTURE_SCHEMA, RECEIPT_SCHEMA
from app.core.config import Settings

logger = logging.getLogger("faldo.ai.compatible")
UNAVAILABLE = "The AI service is temporarily unavailable."
KEY_REST_SECONDS = 30 * 60
RETRY_STATUSES = {500, 502, 503, 504}
MISSING_MODEL = re.compile(r"not (be )?found|does not exist|decommissioned|no longer supported|model_not_found", re.I)


def rest_seconds(headers: Mapping[str, str], body: bytes) -> float:
    """How long a model waits after its free limit: what the service says, else a minute, or an hour for a daily limit."""
    text = body.decode("utf-8", "ignore")
    wait: float | None = None
    if headers.get("retry-after"):
        try:
            wait = float(headers["retry-after"])
        except ValueError:
            wait = None
    if wait is None and (found := re.search(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', text)):
        wait = float(found.group(1))
    if wait is None and (found := re.search(r"(?:retry|try again) in (?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)s", text, re.I)):
        hours, minutes, seconds = found.groups()
        wait = int(hours or 0) * 3600 + int(minutes or 0) * 60 + float(seconds)
    if wait is None:
        wait = 3600 if re.search(r"per ?day|PerDay|\bRPD\b|daily", text, re.I) else 60
    return min(max(wait, 5), 6 * 3600)


def _models(*groups: str | list[str]) -> list[str]:
    """Model names from settings (comma-separated), in order, each once."""
    names: list[str] = []
    for group in groups:
        for name in group.split(",") if isinstance(group, str) else group:
            if name.strip() and name.strip() not in names:
                names.append(name.strip())
    return names


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


def _standard(message: dict[str, Any]) -> dict[str, Any]:
    """An assistant turn with only the standard fields, for services that reject Gemini's extras (thought signatures)."""
    clean: dict[str, Any] = {"role": message.get("role", "assistant"), "content": message.get("content")}
    if message.get("tool_calls"):
        clean["tool_calls"] = [{"id": c.get("id"), "type": "function",
                                "function": {"name": c.get("function", {}).get("name", ""),
                                             "arguments": c.get("function", {}).get("arguments") or "{}"}}
                               for c in message["tool_calls"]]
    return clean


def _messages(system: str, transcript: list[TranscriptItem], standard: bool = False) -> list[dict[str, Any]]:
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
            messages.extend(_standard(m) if standard else m for m in entry.raw)
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
    """Gemini or Groq (or another OpenAI-compatible service) as Faldo's model."""

    is_development = False

    def __init__(self, *, name: str, label: str, base_url: str, api_key: str, key_setting: str, chat_models: list[str],
                 fast_models: list[str], vision_models: list[str] | None = None, standard_messages: bool = False):
        self.name = name
        self.label = label
        self.base_url = base_url.rstrip("/")
        self._key = api_key
        self.key_setting = key_setting
        self.chat_models = chat_models
        self.fast_models = fast_models or chat_models
        self.vision_models = chat_models if vision_models is None else vision_models
        self.supports_vision = bool(self.vision_models)
        self.standard_messages = standard_messages
        self._client: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self.rest_until = 0.0  # the whole service (a bad key)
        self.model_rest: dict[str, float] = {}  # a model that ran out, until when
        self.missing: set[str] = set()  # models the service doesn't have (any more)

    @classmethod
    def gemini(cls, settings: Settings) -> "CompatibleProvider":
        assert settings.gemini_api_key is not None
        fallbacks = _models(settings.gemini_fallback_models)
        return cls(name="gemini", label="Gemini", base_url=settings.gemini_base_url, key_setting="GEMINI_API_KEY",
                   api_key=settings.gemini_api_key.get_secret_value(),
                   chat_models=_models(settings.gemini_chat_model, fallbacks),
                   fast_models=_models(settings.gemini_fast_model, fallbacks, settings.gemini_chat_model))

    @classmethod
    def groq(cls, settings: Settings) -> "CompatibleProvider":
        assert settings.groq_api_key is not None
        return cls(name="groq", label="Groq", base_url=settings.groq_base_url, key_setting="GROQ_API_KEY",
                   api_key=settings.groq_api_key.get_secret_value(), chat_models=_models(settings.groq_chat_models),
                   fast_models=_models(settings.groq_fast_models, settings.groq_chat_models),
                   vision_models=_models(settings.groq_vision_models), standard_messages=True)

    @property
    def chat_model(self) -> str:
        return (self._ready(self.chat_models) or self.chat_models)[0]

    def _ready(self, models: list[str]) -> list[str]:
        now = time.monotonic()
        return [m for m in models if m not in self.missing and self.model_rest.get(m, 0.0) <= now]

    def is_resting(self) -> bool:
        return time.monotonic() < self.rest_until or not self._ready(self.chat_models)

    def _http(self) -> httpx.AsyncClient:
        loop = asyncio.get_running_loop()
        if self._client is None or self._loop is not loop or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))
            self._loop = loop
        return self._client

    @property
    def _headers(self) -> dict[str, str]:
        return {"authorization": f"Bearer {self._key}", "content-type": "application/json"}

    def _refused(self, model: str, status: int, body: bytes, headers: Mapping[str, str]) -> tuple[ProviderUnavailable, bool]:
        """What went wrong, and whether the next model should try (it can't fix a bad key or a bad request)."""
        message = _error_message(body)
        logger.warning("%s (%s) request refused: %s %s", self.label, model, status, message)
        if status == 429:
            self.model_rest[model] = time.monotonic() + rest_seconds(headers, body)
            return ProviderUnavailable(UNAVAILABLE, self._out_hint()), True
        if status in {401, 403} or "api key" in message.lower():
            self.rest_until = time.monotonic() + KEY_REST_SECONDS
            return ProviderUnavailable(UNAVAILABLE, f"{self.label} isn't answering: the API key isn't valid. "
                                                    f"Check {self.key_setting} in Vercel."), False
        if status == 404 or (status == 400 and MISSING_MODEL.search(message) and "model" in message.lower()):
            self.missing.add(model)
            return ProviderUnavailable(UNAVAILABLE, f"{self.label} doesn't have the model {model}."), True
        if status >= 500:
            return ProviderUnavailable(UNAVAILABLE, f"{self.label} had a problem answering (error {status}"
                                                    f"{': ' + message[:90] if message else ''}). Try again shortly."), True
        return ProviderUnavailable(UNAVAILABLE, f"{self.label} refused the request (error {status}"
                                                f"{': ' + message[:120] if message else ''})."), False

    def _out_hint(self) -> str:
        waits = [until - time.monotonic() for until in self.model_rest.values() if until > time.monotonic()]
        soonest = min(waits) if waits else 60
        when = "in a minute" if soonest <= 90 else f"in about {round(soonest / 60)} minutes" if soonest < 3000 else "in about an hour"
        return f"{self.label}'s free limit is used up for now. Faldo will try it again {when}."

    def _none_ready(self) -> ProviderUnavailable:
        if time.monotonic() < self.rest_until:
            return ProviderUnavailable(UNAVAILABLE, f"{self.label} isn't answering: the API key isn't valid. Check {self.key_setting} in Vercel.")
        return ProviderUnavailable(UNAVAILABLE, self._out_hint())

    async def _post_stream(self, body: dict[str, Any]) -> Any:
        """Open the stream, retrying once when the service is briefly overloaded (500/503)."""
        for attempt in range(2):
            request = self._http().build_request("POST", f"{self.base_url}/chat/completions", headers=self._headers, json=body)
            response = await self._http().send(request, stream=True)
            if response.status_code in RETRY_STATUSES and attempt == 0:
                await response.aclose()
                await asyncio.sleep(1.2)
                continue
            return response
        return response

    async def _open_stream(self, body: dict[str, Any], models: list[str]) -> Any:
        """The first model that accepts the request, its stream open; the rest step in when one has run out."""
        if time.monotonic() < self.rest_until:
            raise self._none_ready()
        refused: ProviderUnavailable | None = None
        for model in self._ready(models):
            response = await self._post_stream({**body, "model": model})
            if response.status_code < 400:
                return response
            content = await response.aread()
            await response.aclose()
            refused, next_model = self._refused(model, response.status_code, content, response.headers)
            if not next_model:
                raise refused
        raise refused or self._none_ready()

    async def stream_turn(self, *, system: str, transcript: list[TranscriptItem],
                          tools: list[dict[str, Any]]) -> AsyncIterator[TextDelta | ModelTurn]:
        # A photo in the conversation goes to a model that can see it.
        models = self.vision_models if any(entry.images for entry in transcript) else self.chat_models
        body: dict[str, Any] = {"messages": _messages(system, transcript, self.standard_messages), "stream": True}
        if tools:
            body["tools"] = _tools(tools)
        text: list[str] = []
        calls: dict[int, dict[str, Any]] = {}
        try:
            response = await self._open_stream(body, models)
            try:
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

    async def _complete(self, body: dict[str, Any], models: list[str] | None = None) -> dict[str, Any]:
        if time.monotonic() < self.rest_until:
            raise self._none_ready()
        refused: ProviderUnavailable | None = None
        for model in self._ready(models or self.chat_models):
            payload = {**body, "model": model}
            try:
                response = await self._http().post(f"{self.base_url}/chat/completions", headers=self._headers, json=payload)
                if response.status_code in RETRY_STATUSES:
                    await asyncio.sleep(1.2)
                    response = await self._http().post(f"{self.base_url}/chat/completions", headers=self._headers, json=payload)
            except httpx.HTTPError as exc:
                raise ProviderUnavailable(UNAVAILABLE) from exc
            if response.status_code < 400:
                data: dict[str, Any] = response.json()
                return data
            refused, next_model = self._refused(model, response.status_code, response.content, response.headers)
            if not next_model:
                raise refused
        raise refused or self._none_ready()

    async def _structured(self, instructions: str, content: Any, name: str, schema: dict[str, Any],
                          models: list[str] | None = None) -> dict[str, Any]:
        data = await self._complete({
            "messages": [{"role": "system", "content": instructions}, {"role": "user", "content": content}],
            "tools": [_function(name, "Record the result.", schema)],
            "tool_choice": {"type": "function", "function": {"name": name}},
        }, models)
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
        meta = receipt_meta(context)
        content = [{"type": "text", "text": json.dumps(meta)},
                   {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64.b64encode(image).decode()}"}}]
        try:
            return await self._structured(RECEIPT_INSTRUCTIONS, content, "record_receipt", RECEIPT_SCHEMA, self.vision_models)
        except ProviderUnavailable as exc:
            raise ProviderUnavailable("Receipt reading failed. Try again or enter the details manually.", exc.hint) from exc

    async def _text(self, messages: list[dict[str, Any]]) -> str | None:
        try:
            data = await self._complete({"messages": messages}, self.fast_models)
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
