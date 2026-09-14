import uuid
from datetime import date

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Timestamps, UserOwned, UUIDPk, str_enum
from app.models.enums import DebtDirection, DebtStatus, Frequency, GoalStatus, RecurringKind


class Budget(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "month"),
        CheckConstraint("extract(day from month) = 1", name="month_start"),
    )

    month: Mapped[date] = mapped_column(Date)
    total_limit_minor: Mapped[int | None] = mapped_column(BigInteger)

    lines: Mapped[list["BudgetCategory"]] = relationship(back_populates="budget", cascade="all, delete-orphan")


class BudgetCategory(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "budget_categories"
    __table_args__ = (
        UniqueConstraint("budget_id", "category_id"),
        CheckConstraint("limit_minor > 0", name="limit_positive"),
    )

    budget_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("budgets.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE")
    )
    limit_minor: Mapped[int] = mapped_column(BigInteger)

    budget: Mapped[Budget] = relationship(back_populates="lines")


class SavingsGoal(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "savings_goals"
    __table_args__ = (
        CheckConstraint("target_minor > 0", name="target_positive"),
        CheckConstraint("monthly_contribution_minor IS NULL OR monthly_contribution_minor >= 0", name="monthly_non_negative"),
    )

    name: Mapped[str] = mapped_column(String(80))
    emoji: Mapped[str | None] = mapped_column(String(16))
    target_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="PHP")
    target_date: Mapped[date | None] = mapped_column(Date)
    monthly_contribution_minor: Mapped[int | None] = mapped_column(BigInteger)
    linked_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL")
    )
    status: Mapped[GoalStatus] = mapped_column(str_enum(GoalStatus, "goal_status"), default=GoalStatus.active)
    notes: Mapped[str | None] = mapped_column(Text)

    contributions: Mapped[list["GoalContribution"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="GoalContribution.occurred_on"
    )


class GoalContribution(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "goal_contributions"
    __table_args__ = (CheckConstraint("amount_minor <> 0", name="amount_nonzero"),)

    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("savings_goals.id", ondelete="CASCADE"), index=True
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    occurred_on: Mapped[date] = mapped_column(Date)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(String(200))

    goal: Mapped[SavingsGoal] = relationship(back_populates="contributions")


class RecurringPayment(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "recurring_payments"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="amount_positive"),
        CheckConstraint("interval_count >= 1", name="interval_positive"),
    )

    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[RecurringKind] = mapped_column(str_enum(RecurringKind, "recurring_kind"))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="PHP")
    is_amount_variable: Mapped[bool] = mapped_column(Boolean, default=False)
    frequency: Mapped[Frequency] = mapped_column(str_enum(Frequency, "recurring_frequency"))
    interval_count: Mapped[int] = mapped_column(Integer, default=1)
    next_due_on: Mapped[date] = mapped_column(Date)
    anchor_day: Mapped[int | None] = mapped_column(Integer)
    end_on: Mapped[date | None] = mapped_column(Date)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL")
    )
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="SET NULL")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)


class Debt(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "debts"
    __table_args__ = (CheckConstraint("amount_minor > 0", name="amount_positive"),)

    direction: Mapped[DebtDirection] = mapped_column(str_enum(DebtDirection, "debt_direction"))
    counterparty: Mapped[str] = mapped_column(String(80))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="PHP")
    due_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[DebtStatus] = mapped_column(str_enum(DebtStatus, "debt_status"), default=DebtStatus.open)
    notes: Mapped[str | None] = mapped_column(Text)
    started_on: Mapped[date] = mapped_column(Date)

    payments: Mapped[list["DebtPayment"]] = relationship(
        back_populates="debt", cascade="all, delete-orphan", order_by="DebtPayment.paid_on"
    )


class DebtPayment(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "debt_payments"
    __table_args__ = (CheckConstraint("amount_minor > 0", name="amount_positive"),)

    debt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("debts.id", ondelete="CASCADE"), index=True)
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    paid_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(String(200))

    debt: Mapped[Debt] = relationship(back_populates="payments")


class FinancialNote(UUIDPk, UserOwned, Timestamps, Base):
    __tablename__ = "financial_notes"

    content: Mapped[str] = mapped_column(Text)
    related_goal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("savings_goals.id", ondelete="SET NULL")
    )
