import base64
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from openai import APIError, AsyncOpenAI

from app.ai.providers.base import CaptureContext, ModelTurn, ProviderUnavailable, TextDelta, ToolCall, TranscriptItem
from app.ai.schemas import CAPTURE_SCHEMA, RECEIPT_SCHEMA
from app.core.config import Settings

logger = logging.getLogger("faldo.ai.openai")

CAPTURE_INSTRUCTIONS = """Convert the user's note into financial transactions for a personal finance app.
Rules:
- Only extract what the text states or clearly implies. Never invent amounts, merchants, or items.
- Amounts are in major currency units (e.g. 350.00 for ₱350). "30k" means 30000.
- Resolve relative dates ("yesterday", "kahapon", "last Friday") against today's date. If no date is mentioned, use today.
  If the date is vague ("last week", "the other day"), use your best date and set date_certain to false.
- Use only category, subcategory, and account names from the provided lists. Use null when unsure.
- If more than one category is plausible, set category_alternatives.
- Transfers move money between two of the user's accounts.
- Text may be English, Filipino, or Taglish."""

RECEIPT_INSTRUCTIONS = """Read this image for a personal finance app in the Philippines and extract the money it shows.
It can be any money document: a store or restaurant receipt, an official receipt (OR) or sales invoice, a Shopee or
Lazada order, a GCash, Maya or bank app screenshot (sent, received, paid a bill, InstaPay or PESONet), a utility or
phone bill (Meralco, Maynilad, PLDT, Globe), a fuel slip, a Grab or food delivery receipt, an ATM slip, a payslip, or a
handwritten receipt. It may be a photo at an angle, a screenshot, crumpled or faded.

Rules:
- Copy values exactly as shown. Never invent a number; use null when it isn't there or can't be read.
- Amounts are in major currency units (₱1,299.50 is 1299.5). Read "1.299,50"-style numbers carefully.
- total is the money that actually moved: the "Total", "Amount Due", "Total Payment", "Order Total", "Amount Sent",
  "You paid" or "Net Pay" line, after discounts and vouchers. Never use Cash tendered, Change, VATable Sales, VAT
  Amount or VAT-Exempt Sales as the total. For an unpaid bill, total is the amount due and due_date is set.
- direction: expense when the user paid, bought or sent money; income when they received money (a "Received from"
  transfer, a refund, a payslip's net pay); transfer when money moved between the user's own accounts (cash in,
  top-up, move to savings).
- merchant: the store, restaurant, biller or shop name. For a person-to-person transfer, the other person's name
  as shown (masked names like "JU*N D*** C." are fine).
- Items are only the goods or services bought, with their line amounts. Never list VAT, subtotal, change, cash,
  discounts or fees as items. Leave items empty for transfers and bills.
- Dates: this is the Philippines, so 09/10/2026 usually means September 10. Use today's date to rule out the future.
- paid_from is the wallet, bank or card shown as the source (for income, where the money arrived). Match it to one of
  the user's account names when it clearly is one.
- suggested_category must be one of the provided category names for that direction, or null.
- Set is_receipt to false and document_type to not_financial if the image shows no money movement at all."""

def receipt_meta(context: CaptureContext) -> dict[str, Any]:
    """What the model gets alongside the image: today, the currency, the user's accounts and categories."""
    return {"today": context.today, "currency": context.currency,
            "accounts": [a["name"] for a in context.accounts],
            "expense_categories": [c["name"] for c in context.expense_categories],
            "income_categories": [c["name"] for c in context.income_categories]}


SUMMARY_INSTRUCTIONS = """Rewrite the draft into a short, calm, specific note for the user.
Rules:
- Use ONLY the numbers that appear in the draft or the facts. Do not calculate new numbers.
- Keep every amount and percentage exactly as written.
- No advice about specific investments, loans, or financial products.
- {length}
- Plain text, no markdown."""


def _strict_json(text: str) -> dict[str, Any]:
    return json.loads(text)


class OpenAIProvider:
    name = "openai"
    is_development = False
    supports_vision = True

    def __init__(self, settings: Settings):
        assert settings.openai_api_key is not None
        self.client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value(), timeout=45, max_retries=2)
        self.chat_model = settings.openai_chat_model
        self.fast_model = settings.openai_fast_model
        self.vision_model = settings.openai_vision_model

    def _input(self, transcript: list[TranscriptItem]) -> list[Any]:
        items: list[Any] = []
        for entry in transcript:
            if entry.kind == "user" and entry.images:
                items.append({"role": "user", "content": [
                    *({"type": "input_image", "image_url": f"data:{i['media_type']};base64,{i['data']}", "detail": "high"}
                      for i in entry.images),
                    {"type": "input_text", "text": entry.text or ""}]})
            elif entry.kind == "user":
                items.append({"role": "user", "content": entry.text or ""})
            elif entry.kind == "assistant":
                items.append({"role": "assistant", "content": entry.text or ""})
            elif entry.kind == "model_output":
                items.extend(entry.raw)
            elif entry.kind == "tool_result" and entry.call:
                items.append({
                    "type": "function_call_output",
                    "call_id": entry.call.id,
                    "output": json.dumps(entry.output, default=str),
                })
        return items

    def _request(self, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "model": self.chat_model,
            "instructions": system,
            "input": self._input(transcript),
            "tools": tools,
            "parallel_tool_calls": True,
            "store": False,
            "include": ["reasoning.encrypted_content"],
        }

    @staticmethod
    def _turn(response: Any) -> ModelTurn:
        calls: list[ToolCall] = []
        raw: list[Any] = []
        for item in response.output:
            raw.append(item.model_dump(exclude_none=True))
            if item.type == "function_call":
                try:
                    args = json.loads(item.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                calls.append(ToolCall(id=item.call_id, name=item.name, arguments=args))
        return ModelTurn(text=response.output_text if not calls else None, tool_calls=calls, raw=raw)

    async def assistant_turn(self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]) -> ModelTurn:
        try:
            response = await self.client.responses.create(**self._request(system, transcript, tools))
        except APIError as exc:
            logger.warning("OpenAI assistant call failed: %s", exc.__class__.__name__)
            raise ProviderUnavailable("The AI service is temporarily unavailable.") from exc
        return self._turn(response)

    async def stream_turn(
        self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]
    ) -> AsyncIterator[TextDelta | ModelTurn]:
        """The same turn, streamed: the answer's text arrives as it is written, then the complete turn."""
        try:
            async with self.client.responses.stream(**self._request(system, transcript, tools)) as stream:
                async for event in stream:
                    if event.type == "response.output_text.delta":
                        yield TextDelta(event.delta)
                response = await stream.get_final_response()
        except APIError as exc:
            logger.warning("OpenAI assistant stream failed: %s", exc.__class__.__name__)
            raise ProviderUnavailable("The AI service is temporarily unavailable.") from exc
        yield self._turn(response)

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
            response = await self.client.responses.create(
                model=self.fast_model,
                instructions=CAPTURE_INSTRUCTIONS,
                input=json.dumps(payload, ensure_ascii=False),
                text={"format": {"type": "json_schema", "name": "capture", "schema": CAPTURE_SCHEMA, "strict": True}},
                store=False,
            )
            return _strict_json(response.output_text)
        except (APIError, json.JSONDecodeError) as exc:
            logger.warning("OpenAI capture parse failed: %s", exc.__class__.__name__)
            return None

    async def extract_receipt(self, image: bytes, mime_type: str, context: CaptureContext) -> dict[str, Any]:
        data_url = f"data:{mime_type};base64,{base64.b64encode(image).decode()}"
        meta = receipt_meta(context)
        try:
            response = await self.client.responses.create(
                model=self.vision_model,
                instructions=RECEIPT_INSTRUCTIONS,
                input=[{
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": json.dumps(meta)},
                        {"type": "input_image", "image_url": data_url, "detail": "high"},
                    ],
                }],
                text={"format": {"type": "json_schema", "name": "receipt", "schema": RECEIPT_SCHEMA, "strict": True}},
                store=False,
            )
            return _strict_json(response.output_text)
        except (APIError, json.JSONDecodeError) as exc:
            logger.warning("OpenAI receipt extraction failed: %s", exc.__class__.__name__)
            raise ProviderUnavailable("Receipt reading failed. Try again or enter the details manually.") from exc

    async def write_summary(self, kind: str, facts: dict[str, Any], draft: str) -> str | None:
        length = "One or two sentences, under 45 words." if kind == "pulse" else "Three to four sentences."
        try:
            response = await self.client.responses.create(
                model=self.fast_model,
                instructions=SUMMARY_INSTRUCTIONS.format(length=length),
                input=json.dumps({"draft": draft, "facts": facts}, default=str, ensure_ascii=False),
                store=False,
            )
            return response.output_text.strip() or None
        except APIError as exc:
            logger.warning("OpenAI summary failed: %s", exc.__class__.__name__)
            return None


class OpenAIEmbeddings:
    name = "openai"

    def __init__(self, settings: Settings):
        assert settings.openai_api_key is not None
        self.client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value(), timeout=30, max_retries=2)
        self.model = settings.openai_embedding_model
        self.dimensions = settings.embedding_dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            response = await self.client.embeddings.create(model=self.model, input=texts, dimensions=self.dimensions)
        except APIError as exc:
            raise ProviderUnavailable("Embedding service unavailable.") from exc
        return [d.embedding for d in sorted(response.data, key=lambda d: d.index)]
