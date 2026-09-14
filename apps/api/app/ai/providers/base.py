from dataclasses import dataclass, field
from typing import Any, Protocol


class ProviderUnavailable(Exception):
    pass


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ModelTurn:
    text: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw: list[Any] = field(default_factory=list)


@dataclass
class TranscriptItem:
    kind: str
    text: str | None = None
    call: ToolCall | None = None
    output: dict[str, Any] | None = None
    raw: list[Any] = field(default_factory=list)


@dataclass
class CaptureContext:
    today: str
    currency: str
    accounts: list[dict[str, str]]
    expense_categories: list[dict[str, Any]]
    income_categories: list[dict[str, Any]]
    known_merchants: list[dict[str, str]]


class LLMProvider(Protocol):
    name: str
    is_development: bool
    supports_vision: bool

    async def assistant_turn(
        self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]
    ) -> ModelTurn: ...

    async def parse_transactions(self, text: str, context: CaptureContext) -> dict[str, Any] | None: ...

    async def extract_receipt(self, image: bytes, mime_type: str, context: CaptureContext) -> dict[str, Any]: ...

    async def write_summary(self, kind: str, facts: dict[str, Any], draft: str) -> str | None: ...


class EmbeddingProvider(Protocol):
    name: str
    model: str
    dimensions: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...
