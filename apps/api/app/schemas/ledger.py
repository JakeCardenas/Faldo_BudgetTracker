import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import Field, StringConstraints, model_validator

from app.models.enums import AccountType, CategoryKind, TransactionSource, TransactionType
from app.schemas.common import ApiModel, CurrencyCode, LongText, Name, OutModel, PositiveMoney, SignedMoney


class AccountIn(ApiModel):
    name: Name
    type: AccountType
    custom_type: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    institution: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None
    currency: CurrencyCode | None = None
    opening_balance_minor: SignedMoney = 0
    is_spendable: bool | None = None
    credit_limit_minor: PositiveMoney | None = None
    color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")] | None = None


class AccountUpdate(ApiModel):
    name: Name | None = None
    custom_type: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    institution: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None
    opening_balance_minor: SignedMoney | None = None
    is_spendable: bool | None = None
    credit_limit_minor: PositiveMoney | None = None
    color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")] | None = None
    archived: bool | None = None


class AccountOut(OutModel):
    id: uuid.UUID
    name: str
    type: AccountType
    custom_type: str | None
    institution: str | None
    currency: str
    opening_balance_minor: int
    balance_minor: int
    is_spendable: bool
    credit_limit_minor: int | None
    color: str | None
    archived: bool
    transaction_count: int
    last_activity_on: date | None
    updated_at: datetime


class CategoryIn(ApiModel):
    name: Name
    kind: CategoryKind
    parent_id: uuid.UUID | None = None
    icon: Annotated[str, StringConstraints(max_length=40)] | None = None
    color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")] | None = None
    is_essential: bool = False


class CategoryOut(OutModel):
    id: uuid.UUID
    name: str
    kind: CategoryKind
    parent_id: uuid.UUID | None
    icon: str | None
    color: str | None
    is_essential: bool


class ItemIn(ApiModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    quantity: Annotated[Decimal, Field(gt=0, le=100000, decimal_places=3)] = Decimal(1)
    amount_minor: Annotated[int, Field(ge=0, le=10_000_000_000_00)]


class ItemOut(OutModel):
    id: uuid.UUID
    name: str
    quantity: Decimal
    unit_amount_minor: int | None
    amount_minor: int


class TransactionIn(ApiModel):
    type: TransactionType
    amount_minor: PositiveMoney
    occurred_on: date
    account_id: uuid.UUID
    to_account_id: uuid.UUID | None = None
    merchant: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    category_id: uuid.UUID | None = None
    subcategory_id: uuid.UUID | None = None
    payment_method: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    notes: LongText | None = None
    tags: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]] = Field(
        default_factory=list, max_length=12
    )
    items: list[ItemIn] = Field(default_factory=list, max_length=100)
    recurring_payment_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def check_shape(self) -> Self:
        if self.type == TransactionType.transfer:
            if not self.to_account_id:
                raise ValueError("Transfers need a destination account")
            if self.to_account_id == self.account_id:
                raise ValueError("Choose two different accounts for a transfer")
            if self.items:
                raise ValueError("Transfers cannot have items")
        elif self.to_account_id:
            raise ValueError("Only transfers can have a destination account")
        if self.items and sum(i.amount_minor for i in self.items) > self.amount_minor:
            raise ValueError("Item amounts add up to more than the transaction amount")
        return self


class TransactionOut(OutModel):
    id: uuid.UUID
    type: TransactionType
    amount_minor: int
    currency: str
    occurred_on: date
    account_id: uuid.UUID
    account_name: str
    to_account_id: uuid.UUID | None
    to_account_name: str | None
    merchant: str | None
    category_id: uuid.UUID | None
    category_name: str | None
    category_color: str | None
    category_icon: str | None
    subcategory_id: uuid.UUID | None
    subcategory_name: str | None
    payment_method: str | None
    notes: str | None
    tags: list[str]
    items: list[ItemOut]
    source: TransactionSource
    recurring_payment_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class TransactionList(OutModel):
    items: list[TransactionOut]
    next_cursor: str | None
    total_count: int
    total_income_minor: int
    total_expense_minor: int


class MerchantOut(OutModel):
    id: uuid.UUID
    name: str
    default_category_id: uuid.UUID | None


class NoteIn(ApiModel):
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    related_goal_id: uuid.UUID | None = None


class NoteOut(OutModel):
    id: uuid.UUID
    content: str
    related_goal_id: uuid.UUID | None
    created_at: datetime



class CategoryUpdate(ApiModel):
    name: Name | None = None
    icon: Annotated[str, StringConstraints(max_length=40)] | None = None
    color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")] | None = None
    is_essential: bool | None = None
