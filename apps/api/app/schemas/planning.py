import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import Field, StringConstraints

from app.models.enums import DebtDirection, DebtStatus, Frequency, GoalStatus, RecurringKind
from app.schemas.common import ApiModel, LongText, Name, OutModel, PositiveMoney

MonthStr = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class BudgetLineIn(ApiModel):
    category_id: uuid.UUID
    limit_minor: PositiveMoney


class BudgetUpsert(ApiModel):
    month: MonthStr
    total_limit_minor: PositiveMoney | None = None
    lines: list[BudgetLineIn] = Field(default_factory=list, max_length=60)


class BudgetLineOut(OutModel):
    id: uuid.UUID
    category_id: uuid.UUID
    category_name: str
    category_color: str | None
    category_icon: str | None
    limit_minor: int
    spent_minor: int
    remaining_minor: int
    pct_used: float
    pct_month_elapsed: float
    projected_minor: int
    status: str
    previous_spent_minor: int
    average_spent_minor: int


class BudgetOut(OutModel):
    id: uuid.UUID | None
    month: str
    total_limit_minor: int | None
    total_budgeted_minor: int
    total_spent_minor: int
    total_spent_all_minor: int
    unbudgeted_spent_minor: int
    lines: list[BudgetLineOut]
    history: list[dict[str, int | str]]


class GoalIn(ApiModel):
    name: Name
    emoji: Annotated[str, StringConstraints(max_length=16)] | None = None
    target_minor: PositiveMoney
    target_date: date | None = None
    monthly_contribution_minor: Annotated[int, Field(ge=0, le=10_000_000_000_00)] | None = None
    linked_account_id: uuid.UUID | None = None
    initial_amount_minor: Annotated[int, Field(ge=0, le=10_000_000_000_00)] = 0
    notes: LongText | None = None


class GoalUpdate(ApiModel):
    name: Name | None = None
    emoji: Annotated[str, StringConstraints(max_length=16)] | None = None
    target_minor: PositiveMoney | None = None
    target_date: date | None = None
    monthly_contribution_minor: Annotated[int, Field(ge=0, le=10_000_000_000_00)] | None = None
    linked_account_id: uuid.UUID | None = None
    status: GoalStatus | None = None
    notes: LongText | None = None


class ContributionIn(ApiModel):
    amount_minor: Annotated[int, Field(ge=-10_000_000_000_00, le=10_000_000_000_00)]
    occurred_on: date
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    from_account_id: uuid.UUID | None = None


class ContributionOut(OutModel):
    id: uuid.UUID
    amount_minor: int
    occurred_on: date
    note: str | None
    transaction_id: uuid.UUID | None


class GoalOut(OutModel):
    id: uuid.UUID
    name: str
    emoji: str | None
    target_minor: int
    saved_minor: int
    remaining_minor: int
    pct_complete: float
    target_date: date | None
    monthly_contribution_minor: int | None
    average_monthly_minor: int
    required_monthly_minor: int | None
    months_remaining: float | None
    projected_completion_on: date | None
    on_track: bool | None
    status_reason: str
    linked_account_id: uuid.UUID | None
    linked_account_name: str | None
    status: GoalStatus
    notes: str | None
    contributions: list[ContributionOut]
    created_at: datetime


class RecurringIn(ApiModel):
    name: Name
    kind: RecurringKind
    amount_minor: PositiveMoney
    is_amount_variable: bool = False
    frequency: Frequency
    interval_count: Annotated[int, Field(ge=1, le=12)] = 1
    next_due_on: date
    end_on: date | None = None
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    merchant: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    notes: LongText | None = None


class RecurringUpdate(ApiModel):
    name: Name | None = None
    kind: RecurringKind | None = None
    amount_minor: PositiveMoney | None = None
    is_amount_variable: bool | None = None
    frequency: Frequency | None = None
    interval_count: Annotated[int, Field(ge=1, le=12)] | None = None
    next_due_on: date | None = None
    end_on: date | None = None
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    is_active: bool | None = None
    notes: LongText | None = None


class RecurringOut(OutModel):
    id: uuid.UUID
    name: str
    kind: RecurringKind
    amount_minor: int
    monthly_equivalent_minor: int
    is_amount_variable: bool
    frequency: Frequency
    interval_count: int
    next_due_on: date
    days_until_due: int
    end_on: date | None
    account_id: uuid.UUID | None
    account_name: str | None
    category_id: uuid.UUID | None
    category_name: str | None
    merchant: str | None
    is_active: bool
    notes: str | None


class MarkPaidIn(ApiModel):
    amount_minor: PositiveMoney | None = None
    paid_on: date | None = None
    account_id: uuid.UUID | None = None


class DebtIn(ApiModel):
    direction: DebtDirection
    counterparty: Name
    amount_minor: PositiveMoney
    due_on: date | None = None
    started_on: date | None = None
    notes: LongText | None = None


class DebtUpdate(ApiModel):
    counterparty: Name | None = None
    amount_minor: PositiveMoney | None = None
    due_on: date | None = None
    status: DebtStatus | None = None
    notes: LongText | None = None


class DebtPaymentIn(ApiModel):
    amount_minor: PositiveMoney
    paid_on: date
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None


class DebtPaymentOut(OutModel):
    id: uuid.UUID
    amount_minor: int
    paid_on: date
    note: str | None


class DebtOut(OutModel):
    id: uuid.UUID
    direction: DebtDirection
    counterparty: str
    amount_minor: int
    paid_minor: int
    outstanding_minor: int
    due_on: date | None
    is_overdue: bool
    status: DebtStatus
    notes: str | None
    started_on: date
    payments: list[DebtPaymentOut]
