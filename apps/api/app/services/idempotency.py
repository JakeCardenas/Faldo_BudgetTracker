"""Idempotency-Key handling for writes a retry could repeat.

A request that carries a key first claims (user, operation, key) with an INSERT … ON CONFLICT DO NOTHING, inside the same
database transaction as the write itself. So:

* the first request inserts the claim, does the write and stores its answer; all of it commits or none of it does;
* a retry after that commit finds the claim and gets the stored answer back, with nothing written again;
* a copy arriving *while* the first is still running blocks on the first's uncommitted claim row, then either reads the
  committed answer or, if the first rolled back, runs the write itself;
* the same key with a different request is refused with 409, so a key can't be replayed into a different write;
* claims belong to one user (unique per user, and row-level security), so one user's key never answers another's request.

Failures aren't remembered: an error rolls the claim back with everything else, so fixing the request and retrying works.
"""

import hashlib
import json
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, IdempotencyKeyReused
from app.models import IdempotencyKey

# Long enough for any retry, including a phone that lost signal mid-save; the same key after that is a new request.
KEY_LIFETIME = timedelta(days=7)
REPLAYED_HEADER = "Idempotent-Replayed"


def request_hash(payload: Any) -> str:
    """A fingerprint of what was asked for, independent of key order and formatting."""
    canonical = json.dumps(jsonable_encoder(payload), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def _claim(db: AsyncSession, user_id: uuid.UUID, operation: str, key: str, digest: str) -> uuid.UUID | None:
    return await db.scalar(
        insert(IdempotencyKey)
        .values(user_id=user_id, operation=operation, key=key, request_hash=digest)
        .on_conflict_do_nothing(index_elements=["user_id", "operation", "key"])
        .returning(IdempotencyKey.id)
    )


async def run_once[T](
    db: AsyncSession,
    user_id: uuid.UUID,
    operation: str,
    key: str | None,
    payload: Any,
    write: Callable[[], Awaitable[T]],
    *,
    status_code: int,
) -> T | JSONResponse:
    """Run `write` once per (user, operation, key); a repeat of the same request gets the first answer back."""
    if key is None:
        return await write()
    digest = request_hash(payload)
    # Expired claims go first, so a key older than KEY_LIFETIME counts as new rather than replaying an old answer.
    await db.execute(delete(IdempotencyKey).where(
        IdempotencyKey.user_id == user_id, IdempotencyKey.created_at < datetime.now(UTC) - KEY_LIFETIME))
    for _ in range(2):
        claim_id = await _claim(db, user_id, operation, key, digest)
        if claim_id is not None:
            break
        # Someone holds the key: this user's earlier (committed) request with it.
        existing = await db.scalar(select(IdempotencyKey).where(
            IdempotencyKey.user_id == user_id, IdempotencyKey.operation == operation, IdempotencyKey.key == key))
        if existing is None:
            continue  # it expired between the two statements; claim it afresh
        if existing.request_hash != digest:
            raise IdempotencyKeyReused(
                "This Idempotency-Key was already used for a different request. Send a new key for a new request.")
        return JSONResponse(existing.response_body, status_code=existing.response_status or status_code,
                            headers={REPLAYED_HEADER: "true"})
    else:
        raise Conflict("That request is still being handled. Try again in a moment.")
    result = await write()
    await db.execute(update(IdempotencyKey).where(IdempotencyKey.id == claim_id)
                     .values(response_status=status_code, response_body=jsonable_encoder(result)))
    return result
