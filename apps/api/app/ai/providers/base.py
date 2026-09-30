from dataclasses import dataclass, field
from typing import Any, Protocol


class ProviderUnavailable(Exception):
    """The AI service refused or failed. `hint` says why in plain words, for whoever runs this Faldo."""

    def __init__(self, message: str = "The AI service is temporarily unavailable.", hint: str | None = None):
        super().__init__(message)
        self.hint = hint


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class TextDelta:
    """A piece of the answer as the model writes it, for providers that stream (see stream_turn)."""

    text: str


@dataclass
class ModelTurn:
    text: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw: list[Any] = field(default_factory=list)
    paused: bool = False
    """The service paused a long turn (web searches); send it back to continue."""
    citations: list[dict[str, Any]] = field(default_factory=list)
    """Web pages the answer quoted: url, title and the cited text."""


@dataclass
class TranscriptItem:
    kind: str
    """user, assistant, model_output, tool_result, or context: Faldo's data block for the next user message (see
    with_context). Context is never an instruction, so it never goes in the system prompt."""
    text: str | None = None
    call: ToolCall | None = None
    output: dict[str, Any] | None = None
    raw: list[Any] = field(default_factory=list)
    images: list[dict[str, str]] = field(default_factory=list)
    """Photos sent with a user message: media_type and base64 data."""


def with_context(transcript: list["TranscriptItem"]) -> list["TranscriptItem"]:
    """The transcript as a model should see it: each context block joined to the front of the user message after it,
    so the conversation still alternates user and assistant turns."""
    out: list[TranscriptItem] = []
    pending: list[str] = []
    for item in transcript:
        if item.kind == "context":
            if item.text:
                pending.append(item.text)
            continue
        if item.kind == "user" and pending:
            item = TranscriptItem("user", text="\n\n".join([*pending, item.text or ""]), images=item.images)
            pending = []
        out.append(item)
    return out


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

    # Providers that stream may also define
    #   stream_turn(*, system, transcript, tools) -> AsyncIterator[TextDelta | ModelTurn]
    # which yields the answer's text as it is written and ends with the complete ModelTurn.


class EmbeddingProvider(Protocol):
    name: str
    model: str
    dimensions: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...
