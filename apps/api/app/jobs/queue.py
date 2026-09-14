import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Job
from app.models.enums import JobStatus


async def enqueue(
    db: AsyncSession, kind: str, user_id: uuid.UUID | None, payload: dict[str, Any] | None = None,
    dedupe_key: str | None = None,
) -> None:
    if dedupe_key:
        existing = await db.scalar(
            select(Job.id).where(Job.dedupe_key == dedupe_key, Job.status == JobStatus.queued)
        )
        if existing:
            return
    db.add(Job(kind=kind, user_id=user_id, payload=payload or {}, dedupe_key=dedupe_key))


async def enqueue_index(db: AsyncSession, user_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID) -> None:
    await enqueue(
        db, "index_entity", user_id, {"entity_type": entity_type, "entity_id": str(entity_id)},
        dedupe_key=f"index:{entity_type}:{entity_id}",
    )


async def enqueue_unindex(db: AsyncSession, user_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID) -> None:
    await enqueue(db, "unindex_entity", user_id, {"entity_type": entity_type, "entity_id": str(entity_id)})


async def enqueue_monthly_summary(db: AsyncSession, user_id: uuid.UUID, month: date) -> None:
    key = f"{month.year:04d}-{month.month:02d}"
    await enqueue(db, "index_monthly_summary", user_id, {"month": key}, dedupe_key=f"summary:{user_id}:{key}")
