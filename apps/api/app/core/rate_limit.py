import hashlib
import random
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert

from app.core.config import get_settings
from app.core.errors import RateLimited


class MemoryLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)

    async def hit(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        events = self._events[key]
        while events and events[0] <= now - window_seconds:
            events.popleft()
        if len(events) >= limit:
            retry = int(window_seconds - (now - events[0])) + 1
            raise RateLimited(f"Too many requests. Try again in {retry} seconds.")
        events.append(now)

    def reset(self) -> None:
        self._events.clear()


class DatabaseLimiter:
    async def hit(self, key: str, limit: int, window_seconds: int) -> None:
        from app.core.db import get_sessionmaker
        from app.models import RateLimitHit

        now = datetime.now(UTC)
        epoch = int(now.timestamp())
        window_start = datetime.fromtimestamp(epoch - epoch % window_seconds, UTC)
        hashed = hashlib.sha256(key.encode()).hexdigest()
        async with get_sessionmaker()() as session, session.begin():
            insert_stmt = insert(RateLimitHit).values(
                key=hashed, window_start=window_start, count=1, expires_at=window_start + timedelta(seconds=window_seconds)
            )
            stmt = insert_stmt.on_conflict_do_update(
                index_elements=["key", "window_start"], set_={"count": RateLimitHit.count + 1}
            ).returning(RateLimitHit.count)
            count = (await session.execute(stmt)).scalar_one()
            if random.random() < 0.02:
                await session.execute(delete(RateLimitHit).where(RateLimitHit.expires_at < now))
        if count > limit:
            retry = int((window_start + timedelta(seconds=window_seconds) - now).total_seconds()) + 1
            raise RateLimited(f"Too many requests. Try again in {retry} seconds.")

    def reset(self) -> None:
        return None


_memory = MemoryLimiter()
_database = DatabaseLimiter()


class Limiter:
    async def hit(self, key: str, limit: int, window_seconds: int) -> None:
        backend = _database if get_settings().rate_limit_backend == "database" else _memory
        await backend.hit(key, limit, window_seconds)

    def reset(self) -> None:
        _memory.reset()


limiter = Limiter()
