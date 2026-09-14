import uuid
from datetime import date, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Computed,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UserOwned, UUIDPk, str_enum
from app.models.enums import InsightSeverity, InsightStatus, JobStatus, ReceiptStatus

EMBEDDING_DIMENSIONS = 1536


class Receipt(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "receipts"

    storage_key: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(40))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[ReceiptStatus] = mapped_column(str_enum(ReceiptStatus, "receipt_status"))
    provider: Mapped[str | None] = mapped_column(String(40))
    extraction: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    validation_issues: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    error: Mapped[str | None] = mapped_column(String(300))
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL")
    )


class MemoryDocument(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "embeddings"
    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id"),
        Index("ix_embeddings_user_type_date", "user_id", "entity_type", "occurred_on"),
        Index("ix_embeddings_search_tsv", "search_tsv", postgresql_using="gin"),
        Index("ix_embeddings_content_trgm", "content", postgresql_using="gin", postgresql_ops={"content": "gin_trgm_ops"}),
    )

    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    provenance: Mapped[str] = mapped_column(String(16), default="user")
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    embedding_model: Mapped[str] = mapped_column(String(64))
    search_tsv: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple', content)", persisted=True)
    )
    occurred_on: Mapped[date | None] = mapped_column(Date)
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    amount_minor: Mapped[int | None] = mapped_column(BigInteger)
    doc_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)


class AIInsight(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "ai_insights"
    __table_args__ = (UniqueConstraint("user_id", "dedupe_key"),)

    type: Mapped[str] = mapped_column(String(40))
    severity: Mapped[InsightSeverity] = mapped_column(str_enum(InsightSeverity, "insight_severity"))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    facts: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    evidence: Mapped[list[str]] = mapped_column(JSONB, default=list)
    dedupe_key: Mapped[str] = mapped_column(String(160))
    period_key: Mapped[str] = mapped_column(String(16))
    status: Mapped[InsightStatus] = mapped_column(str_enum(InsightStatus, "insight_status"), default=InsightStatus.active)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AIConversation(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "ai_conversations"

    title: Mapped[str] = mapped_column(String(120))


class AIMessage(UUIDPk, UserOwned, Base):
    __tablename__ = "ai_messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    blocks: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    tool_calls: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    follow_ups: Mapped[list[str]] = mapped_column(JSONB, default=list)
    provider: Mapped[str | None] = mapped_column(String(40))
    validation: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_status_run_after", "status", "run_after"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(40))
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    dedupe_key: Mapped[str | None] = mapped_column(String(160))
    status: Mapped[JobStatus] = mapped_column(str_enum(JobStatus, "job_status"), default=JobStatus.queued)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class StoredFile(UserOwned, Base):
    __tablename__ = "stored_files"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    mime_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RateLimitHit(Base):
    __tablename__ = "rate_limit_hits"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
