import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Timestamps, UserOwned, UUIDPk, str_enum
from app.models.enums import AccountType, CategoryKind, TransactionSource, TransactionType


class Account(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "name"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_code"),
    )

    name: Mapped[str] = mapped_column(String(60))
    type: Mapped[AccountType] = mapped_column(str_enum(AccountType, "account_type"))
    custom_type: Mapped[str | None] = mapped_column(String(40))
    institution: Mapped[str | None] = mapped_column(String(60))
    currency: Mapped[str] = mapped_column(String(3), default="PHP")
    opening_balance_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    is_spendable: Mapped[bool] = mapped_column(Boolean, default=True)
    credit_limit_minor: Mapped[int | None] = mapped_column(BigInteger)
    color: Mapped[str | None] = mapped_column(String(16))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Category(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "parent_id", "name", "kind"),)

    name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[CategoryKind] = mapped_column(str_enum(CategoryKind, "category_kind"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), index=True
    )
    icon: Mapped[str | None] = mapped_column(String(40))
    color: Mapped[str | None] = mapped_column(String(16))
    is_essential: Mapped[bool] = mapped_column(Boolean, default=False)


class Merchant(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "merchants"
    __table_args__ = (
        UniqueConstraint("user_id", "normalized_name"),
        Index("ix_merchants_name_trgm", "normalized_name", postgresql_using="gin",
              postgresql_ops={"normalized_name": "gin_trgm_ops"}),
    )

    name: Mapped[str] = mapped_column(String(80))
    normalized_name: Mapped[str] = mapped_column(String(80))
    default_category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL")
    )


transaction_tags = Table(
    "transaction_tags",
    Base.metadata,
    Column("transaction_id", UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(UUIDPk, UserOwned, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    name: Mapped[str] = mapped_column(String(40))


class Transaction(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="amount_positive"),
        CheckConstraint(
            "(type = 'transfer') = (to_account_id IS NOT NULL)", name="transfer_destination"
        ),
        CheckConstraint("to_account_id IS NULL OR to_account_id <> account_id", name="transfer_distinct"),
        CheckConstraint("type NOT IN ('debt_in', 'debt_out') OR debt_id IS NOT NULL", name="debt_movement_linked"),
        Index("ix_transactions_user_date", "user_id", "occurred_on"),
        Index("ix_transactions_user_category_date", "user_id", "category_id", "occurred_on"),
        Index("ix_transactions_user_account_date", "user_id", "account_id", "occurred_on"),
        Index("uq_transactions_account_external_ref", "user_id", "account_id", "external_ref", unique=True,
              postgresql_where=text("external_ref IS NOT NULL")),
    )

    type: Mapped[TransactionType] = mapped_column(str_enum(TransactionType, "transaction_type"))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="PHP")
    occurred_on: Mapped[date] = mapped_column(Date)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id")
    )
    to_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id")
    )
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="SET NULL"), index=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL")
    )
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL")
    )
    payment_method: Mapped[str | None] = mapped_column(String(40))
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[TransactionSource] = mapped_column(
        str_enum(TransactionSource, "transaction_source"), default=TransactionSource.manual
    )
    recurring_payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recurring_payments.id", ondelete="SET NULL")
    )
    debt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("debts.id", ondelete="CASCADE"), index=True
    )
    external_ref: Mapped[str | None] = mapped_column(String(120))  # statement line identity, for safe re-imports
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("import_batches.id", ondelete="SET NULL"), index=True
    )

    items: Mapped[list["TransactionItem"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan", order_by="TransactionItem.position"
    )
    tags: Mapped[list[Tag]] = relationship(secondary=transaction_tags)
    merchant: Mapped[Merchant | None] = relationship()
    category: Mapped[Category | None] = relationship(foreign_keys=[category_id])
    subcategory: Mapped[Category | None] = relationship(foreign_keys=[subcategory_id])
    account: Mapped[Account] = relationship(foreign_keys=[account_id])
    to_account: Mapped[Account | None] = relationship(foreign_keys=[to_account_id])


class TransactionItem(UUIDPk, UserOwned, Base):
    __tablename__ = "transaction_items"
    __table_args__ = (
        CheckConstraint("amount_minor >= 0", name="amount_non_negative"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        Index("ix_transaction_items_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
    )

    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=Decimal(1))
    unit_amount_minor: Mapped[int | None] = mapped_column(BigInteger)
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    position: Mapped[int] = mapped_column(Integer, default=0)

    transaction: Mapped[Transaction] = relationship(back_populates="items")


class ImportBatch(UUIDPk, UserOwned, Timestamps, Base):
    """One imported statement file. Undoing an import removes exactly the transactions it created."""

    __tablename__ = "import_batches"

    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String(20), default="csv", server_default="csv")
    file_name: Mapped[str | None] = mapped_column(String(200))
    imported_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    skipped_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    date_from: Mapped[date | None] = mapped_column(Date)
    date_to: Mapped[date | None] = mapped_column(Date)

