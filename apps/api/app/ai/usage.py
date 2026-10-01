"""Daily limits on calls to outside AI services, per person and for the whole server.

Every call Faldo makes to an outside model (a chat round, reading typed entries, reading a receipt, writing a summary)
is counted before it is sent, including ones that then fail, since a failed call can still use up a free quota. The
counts live in Postgres on serverless deployments (RATE_LIMIT_BACKEND=database), so every instance sees the same
numbers. A day is a calendar day in the Philippines.

Past a person's limit, or the server's, Faldo carries on with its own rules: basic answers in chat, rules-only reading
of typed entries, manual entry for receipts and template summaries. Nothing is sent to the outside service.
"""

import hashlib
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert

from app.ai.providers.base import ProviderUnavailable
from app.core.config import get_settings

DAY_ZONE = ZoneInfo("Asia/Manila")
Scope = Literal["user", "global"]

USER_LIMIT_HINT = ("You've reached today's limit for Faldo's AI, so this is Faldo's basic answer from your own numbers. "
                   "It resets at midnight.")
GLOBAL_LIMIT_HINT = ("Faldo's AI has reached its limit for today, so this is Faldo's basic answer from your own numbers. "
                     "It resets at midnight.")


class AIBudgetExceeded(ProviderUnavailable):
    """No more outside AI calls today, for this person or for everyone."""

    def __init__(self, scope: Scope):
        hint = USER_LIMIT_HINT if scope == "user" else GLOBAL_LIMIT_HINT
        super().__init__("Today's AI limit has been reached.", hint=hint)
        self.scope = scope


def _today() -> date:
    return datetime.now(DAY_ZONE).date()


class _Memory:
    def __init__(self) -> None:
        self.counts: dict[tuple[date, str], int] = defaultdict(int)

    async def add(self, day: date, subject: str) -> int:
        self.counts[(day, subject)] += 1
        return self.counts[(day, subject)]

    async def peek(self, day: date, subject: str) -> int:
        return self.counts.get((day, subject), 0)


class _Database:
    """Counters in rate_limit_hits (no personal data: the key is a hash), one row per subject and day."""

    @staticmethod
    def _key(day: date, subject: str) -> str:
        return hashlib.sha256(f"ai-usage:{day.isoformat()}:{subject}".encode()).hexdigest()

    async def add(self, day: date, subject: str) -> int:
        from app.core.db import get_sessionmaker
        from app.models import RateLimitHit

        start = datetime.combine(day, time(), DAY_ZONE).astimezone(UTC)
        async with get_sessionmaker()() as session, session.begin():
            values = insert(RateLimitHit).values(key=self._key(day, subject), window_start=start, count=1,
                                                 expires_at=start + timedelta(days=2))
            stmt = values.on_conflict_do_update(index_elements=["key", "window_start"],
                                                set_={"count": RateLimitHit.count + 1}).returning(RateLimitHit.count)
            return int((await session.execute(stmt)).scalar_one())

    async def peek(self, day: date, subject: str) -> int:
        from sqlalchemy import select

        from app.core.db import get_sessionmaker
        from app.models import RateLimitHit

        start = datetime.combine(day, time(), DAY_ZONE).astimezone(UTC)
        async with get_sessionmaker()() as session:
            found = await session.scalar(select(RateLimitHit.count).where(
                RateLimitHit.key == self._key(day, subject), RateLimitHit.window_start == start))
            return int(found or 0)


_memory = _Memory()
_database = _Database()


def _store() -> _Memory | _Database:
    return _database if get_settings().rate_limit_backend == "database" else _memory


def reset() -> None:
    _memory.counts.clear()


async def daily_limit(user_id: uuid.UUID) -> int:
    """A person's outside AI calls per day: a demo sandbox (services/demo.py) gets far fewer than a real account."""
    from sqlalchemy import select

    from app.core.db import get_sessionmaker
    from app.models import User

    settings = get_settings()
    async with get_sessionmaker()() as session:
        demo_ends = await session.scalar(select(User.demo_expires_at).where(User.id == user_id))
    return settings.ai_demo_daily_calls if demo_ends is not None else settings.ai_user_daily_calls


async def charge(user_id: uuid.UUID | None, kind: str) -> None:
    """Count one outside AI call, or raise AIBudgetExceeded if today's limit is used up.

    A person over their own limit is refused before the server-wide count moves, so one person can't use up everyone
    else's share by retrying.
    """
    settings = get_settings()
    store, day = _store(), _today()
    if user_id is not None and await store.add(day, f"user:{user_id}") > await daily_limit(user_id):
        raise AIBudgetExceeded("user")
    if await store.add(day, "global") > settings.ai_global_daily_calls:
        raise AIBudgetExceeded("global")


async def used_today(user_id: uuid.UUID) -> dict[str, int]:
    store, day = _store(), _today()
    return {"user": await store.peek(day, f"user:{user_id}"), "global": await store.peek(day, "global")}


# Which provider methods reach an outside model, and what they're for.
KINDS = {"assistant_turn": "chat", "stream_turn": "chat", "parse_transactions": "capture", "extract_receipt": "receipt",
         "write_summary": "summary", "summarize_conversation": "summary"}
# Calls whose caller already copes with no answer (rules, templates): past the limit they just return None.
QUIET = {"capture", "summary"}


class Metered:
    """An outside provider whose every model call is counted against the person's and the server's daily limits."""

    def __init__(self, inner: Any, user_id: uuid.UUID | None):
        self._inner = inner
        self._user_id = user_id

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._inner, name)
        kind = KINDS.get(name)
        if kind is None:
            return attr
        user_id = self._user_id
        if name == "stream_turn":
            async def streamed(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
                await charge(user_id, kind)
                async for item in attr(*args, **kwargs):
                    yield item
            return streamed

        async def call(*args: Any, **kwargs: Any) -> Any:
            try:
                await charge(user_id, kind)
            except AIBudgetExceeded:
                if kind in QUIET:
                    return None
                raise
            return await attr(*args, **kwargs)
        return call


def metered(provider: Any, user_id: uuid.UUID | None) -> Any:
    """The provider as the rest of Faldo should call it: outside services counted, the local rules free."""
    return provider if provider.is_development else Metered(provider, user_id)
