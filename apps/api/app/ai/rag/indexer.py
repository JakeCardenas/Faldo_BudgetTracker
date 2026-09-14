import hashlib
import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.factory import get_embeddings
from app.ai.providers.base import EmbeddingProvider
from app.ai.rag.documents import RenderedDocument, render
from app.engine.periods import parse_month
from app.models import MemoryDocument


def content_hash(content: str, model: str) -> str:
    return hashlib.sha256(f"{model}\n{content}".encode()).hexdigest()


async def upsert_documents(
    db: AsyncSession, user_id: uuid.UUID, docs: list[RenderedDocument], embeddings: EmbeddingProvider | None = None
) -> int:
    if not docs:
        return 0
    embeddings = embeddings or get_embeddings()
    existing = {
        (row.entity_type, row.entity_id): row.content_hash
        for row in (
            await db.execute(
                select(MemoryDocument.entity_type, MemoryDocument.entity_id, MemoryDocument.content_hash).where(
                    MemoryDocument.user_id == user_id,
                    MemoryDocument.entity_id.in_([d.entity_id for d in docs]),
                )
            )
        ).all()
    }
    pending = [d for d in docs if existing.get((d.entity_type, d.entity_id)) != content_hash(d.content, embeddings.model)]
    if not pending:
        return 0
    vectors: list[list[float]] = []
    for start in range(0, len(pending), 96):
        vectors.extend(await embeddings.embed([d.content for d in pending[start:start + 96]]))
    for doc, vector in zip(pending, vectors, strict=True):
        values = {
            "user_id": user_id,
            "entity_type": doc.entity_type,
            "entity_id": doc.entity_id,
            "provenance": doc.provenance,
            "content": doc.content,
            "content_hash": content_hash(doc.content, embeddings.model),
            "embedding": vector,
            "embedding_model": embeddings.model,
            "occurred_on": doc.occurred_on,
            "category_id": doc.category_id,
            "account_id": doc.account_id,
            "amount_minor": doc.amount_minor,
            "metadata": doc.metadata,
        }
        stmt = insert(MemoryDocument.__table__).values(**values)  # type: ignore[arg-type]
        update_cols: dict[str, Any] = {k: stmt.excluded[k] for k in values if k not in {"user_id", "entity_type", "entity_id"}}
        update_cols["updated_at"] = func.now()
        await db.execute(stmt.on_conflict_do_update(index_elements=["user_id", "entity_type", "entity_id"], set_=update_cols))
    return len(pending)


async def index_entity(db: AsyncSession, user_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID, currency: str) -> int:
    docs = await render(db, user_id, entity_type, entity_id, currency)
    if entity_type == "transaction":
        keep_items = [d.entity_id for d in docs if d.entity_type == "transaction_item"]
        stmt = delete(MemoryDocument).where(
            MemoryDocument.user_id == user_id,
            MemoryDocument.entity_type == "transaction_item",
            MemoryDocument.doc_metadata["transaction_id"].astext == str(entity_id),
        )
        if keep_items:
            stmt = stmt.where(MemoryDocument.entity_id.not_in(keep_items))
        await db.execute(stmt)
    if not docs:
        await unindex_entity(db, user_id, entity_type, entity_id)
        return 0
    return await upsert_documents(db, user_id, docs)


async def index_monthly_summary(db: AsyncSession, user_id: uuid.UUID, month: str, currency: str) -> int:
    from app.services.transactions import monthly_summary_entity_id

    docs = await render(db, user_id, "monthly_summary", monthly_summary_entity_id(user_id, parse_month(month)), currency, month)
    if not docs:
        await unindex_entity(db, user_id, "monthly_summary", monthly_summary_entity_id(user_id, parse_month(month)))
        return 0
    return await upsert_documents(db, user_id, docs)


async def unindex_entity(db: AsyncSession, user_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID) -> None:
    await db.execute(
        delete(MemoryDocument).where(
            MemoryDocument.user_id == user_id, MemoryDocument.entity_type == entity_type, MemoryDocument.entity_id == entity_id
        )
    )
    if entity_type == "transaction":
        await db.execute(
            delete(MemoryDocument).where(
                MemoryDocument.user_id == user_id,
                MemoryDocument.entity_type == "transaction_item",
                MemoryDocument.doc_metadata["transaction_id"].astext == str(entity_id),
            )
        )
