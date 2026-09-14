import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.ai.rag.indexer import index_entity, index_monthly_summary, unindex_entity
from app.core.config import get_settings
from app.core.db import get_sessionmaker, scoped_session, set_user_scope
from app.engine.periods import today_in
from app.models import Job, UserSettings
from app.models.enums import JobStatus

logger = logging.getLogger("faldo.worker")
MAX_ATTEMPTS = 4


async def _claim(user_id: uuid.UUID | None = None) -> Job | None:
    async with get_sessionmaker()() as session, session.begin():
        await set_user_scope(session, None)
        stmt = select(Job).where(Job.status == JobStatus.queued, Job.run_after <= datetime.now(UTC))
        if user_id is not None:
            stmt = stmt.where(Job.user_id == user_id)
        job = (await session.execute(stmt.order_by(Job.id).limit(1).with_for_update(skip_locked=True))).scalar_one_or_none()
        if job is None:
            return None
        job.status = JobStatus.running
        job.attempts += 1
        return job


async def _finish(job_id: int, status: JobStatus, error: str | None = None, retry_in: timedelta | None = None) -> None:
    async with get_sessionmaker()() as session, session.begin():
        values: dict = {"status": status, "last_error": error[:500] if error else None}
        if retry_in is not None:
            values["run_after"] = datetime.now(UTC) + retry_in
        await session.execute(update(Job).where(Job.id == job_id).values(**values))


async def handle(job: Job) -> None:
    user_id = job.user_id
    if user_id is None:
        return
    async with scoped_session(user_id) as db:
        settings = await db.get(UserSettings, user_id)
        if settings is None:
            return
        payload = job.payload
        if job.kind == "index_entity":
            await index_entity(db, user_id, payload["entity_type"], uuid.UUID(payload["entity_id"]), settings.currency)
        elif job.kind == "unindex_entity":
            await unindex_entity(db, user_id, payload["entity_type"], uuid.UUID(payload["entity_id"]))
        elif job.kind == "index_monthly_summary":
            await index_monthly_summary(db, user_id, payload["month"], settings.currency)
        elif job.kind == "extract_receipt":
            from app.services.receipts import process_receipt

            await process_receipt(db, user_id, uuid.UUID(payload["receipt_id"]), settings, today_in(settings.timezone))
        else:
            logger.warning("Unknown job kind %s", job.kind)


async def run_once(user_id: uuid.UUID | None = None) -> bool:
    job = await _claim(user_id)
    if job is None:
        return False
    try:
        await handle(job)
    except Exception as exc:
        logger.exception("Job %s (%s) failed", job.id, job.kind)
        if job.attempts < MAX_ATTEMPTS:
            await _finish(job.id, JobStatus.queued, exc.__class__.__name__, timedelta(seconds=5 * 2 ** job.attempts))
        else:
            await _finish(job.id, JobStatus.failed, exc.__class__.__name__)
        return True
    await _finish(job.id, JobStatus.done)
    return True


async def drain(max_jobs: int = 10_000, user_id: uuid.UUID | None = None) -> int:
    processed = 0
    while processed < max_jobs and await run_once(user_id):
        processed += 1
    return processed


async def run_forever(stop: asyncio.Event | None = None) -> None:
    poll = get_settings().worker_poll_seconds
    while stop is None or not stop.is_set():
        try:
            worked = await run_once()
        except Exception:
            logger.exception("Worker loop error")
            worked = False
        if not worked:
            await asyncio.sleep(poll)
