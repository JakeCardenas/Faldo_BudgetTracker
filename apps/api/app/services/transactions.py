import base64
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

from sqlalchemy import Select, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, Conflict, NotFound
from app.engine.periods import month_start
from app.jobs.queue import enqueue_index, enqueue_monthly_summary, enqueue_unindex
from app.models import (
    Account,
    Category,
    Merchant,
    RecurringPayment,
    Tag,
    Transaction,
    TransactionItem,
    transaction_tags,
)
from app.models.enums import CategoryKind, TransactionSource, TransactionType
from app.schemas.ledger import ItemOut, TransactionIn, TransactionList, TransactionOut
from app.services.categories import resolve_category_pair
from app.services.common import get_owned, normalize_name

SortKey = Literal["date_desc", "date_asc", "amount_desc", "amount_asc"]
PAGE_MAX = 100


def monthly_summary_entity_id(user_id: uuid.UUID, month: date) -> uuid.UUID:
    return uuid.uuid5(user_id, f"monthly_summary:{month_start(month).isoformat()}")


@dataclass
class TransactionFilters:
    q: str | None = None
    types: list[TransactionType] | None = None
    account_ids: list[uuid.UUID] | None = None
    category_ids: list[uuid.UUID] | None = None
    tag: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    min_amount_minor: int | None = None
    max_amount_minor: int | None = None
    merchant_id: uuid.UUID | None = None
    ids: list[uuid.UUID] | None = None


def _eager() -> list:
    return [
        selectinload(Transaction.items),
        selectinload(Transaction.tags),
        selectinload(Transaction.merchant),
        selectinload(Transaction.category),
        selectinload(Transaction.subcategory),
        selectinload(Transaction.account),
        selectinload(Transaction.to_account),
    ]


def to_out(t: Transaction) -> TransactionOut:
    return TransactionOut(
        id=t.id, type=t.type, amount_minor=t.amount_minor, currency=t.currency, occurred_on=t.occurred_on,
        account_id=t.account_id, account_name=t.account.name,
        to_account_id=t.to_account_id, to_account_name=t.to_account.name if t.to_account else None,
        merchant=t.merchant.name if t.merchant else None,
        category_id=t.category_id, category_name=t.category.name if t.category else None,
        category_color=t.category.color if t.category else None,
        category_icon=t.category.icon if t.category else None,
        subcategory_id=t.subcategory_id, subcategory_name=t.subcategory.name if t.subcategory else None,
        payment_method=t.payment_method, notes=t.notes, tags=sorted(tag.name for tag in t.tags),
        items=[ItemOut.model_validate(i) for i in t.items], source=t.source,
        recurring_payment_id=t.recurring_payment_id, debt_id=t.debt_id, created_at=t.created_at, updated_at=t.updated_at,
    )


def apply_filters(stmt: Select, user_id: uuid.UUID, f: TransactionFilters) -> Select:
    stmt = stmt.where(Transaction.user_id == user_id)
    if f.ids is not None:
        stmt = stmt.where(Transaction.id.in_(f.ids))
    if f.types:
        stmt = stmt.where(Transaction.type.in_(f.types))
    if f.account_ids:
        stmt = stmt.where(or_(Transaction.account_id.in_(f.account_ids), Transaction.to_account_id.in_(f.account_ids)))
    if f.category_ids:
        stmt = stmt.where(or_(Transaction.category_id.in_(f.category_ids), Transaction.subcategory_id.in_(f.category_ids)))
    if f.merchant_id:
        stmt = stmt.where(Transaction.merchant_id == f.merchant_id)
    if f.date_from:
        stmt = stmt.where(Transaction.occurred_on >= f.date_from)
    if f.date_to:
        stmt = stmt.where(Transaction.occurred_on <= f.date_to)
    if f.min_amount_minor is not None:
        stmt = stmt.where(Transaction.amount_minor >= f.min_amount_minor)
    if f.max_amount_minor is not None:
        stmt = stmt.where(Transaction.amount_minor <= f.max_amount_minor)
    if f.tag:
        stmt = stmt.where(
            exists().where(
                transaction_tags.c.transaction_id == Transaction.id,
                transaction_tags.c.tag_id == Tag.id,
                func.lower(Tag.name) == f.tag.lower(),
            )
        )
    if f.q:
        pattern = f"%{f.q.strip()}%"
        stmt = stmt.where(
            or_(
                Transaction.notes.ilike(pattern),
                exists().where(Merchant.id == Transaction.merchant_id, Merchant.name.ilike(pattern)),
                exists().where(TransactionItem.transaction_id == Transaction.id, TransactionItem.name.ilike(pattern)),
                exists().where(
                    Category.id.in_([Transaction.category_id, Transaction.subcategory_id]), Category.name.ilike(pattern)
                ),
                exists().where(
                    transaction_tags.c.transaction_id == Transaction.id,
                    transaction_tags.c.tag_id == Tag.id,
                    Tag.name.ilike(pattern),
                ),
            )
        )
    return stmt


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


def _decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(base64.urlsafe_b64decode(cursor.encode()).decode()))
    except (ValueError, UnicodeDecodeError) as exc:
        raise AppError("Invalid cursor.") from exc


async def list_transactions(
    db: AsyncSession, user_id: uuid.UUID, filters: TransactionFilters, sort: SortKey = "date_desc",
    limit: int = 50, cursor: str | None = None,
) -> TransactionList:
    limit = max(1, min(limit, PAGE_MAX))
    offset = _decode_cursor(cursor)
    order: list[Any] = {
        "date_desc": [Transaction.occurred_on.desc(), Transaction.created_at.desc()],
        "date_asc": [Transaction.occurred_on.asc(), Transaction.created_at.asc()],
        "amount_desc": [Transaction.amount_minor.desc(), Transaction.occurred_on.desc()],
        "amount_asc": [Transaction.amount_minor.asc(), Transaction.occurred_on.desc()],
    }[sort]
    stmt = apply_filters(select(Transaction), user_id, filters).options(*_eager()).order_by(*order, Transaction.id)
    rows = (await db.execute(stmt.offset(offset).limit(limit + 1))).scalars().all()
    totals_stmt = apply_filters(
        select(
            func.count(Transaction.id),
            func.coalesce(func.sum(Transaction.amount_minor).filter(Transaction.type == TransactionType.income), 0),
            func.coalesce(func.sum(Transaction.amount_minor).filter(Transaction.type == TransactionType.expense), 0),
        ),
        user_id,
        filters,
    )
    count, income, expense = (await db.execute(totals_stmt)).one()
    has_more = len(rows) > limit
    return TransactionList(
        items=[to_out(t) for t in rows[:limit]],
        next_cursor=_encode_cursor(offset + limit) if has_more else None,
        total_count=count,
        total_income_minor=int(income),
        total_expense_minor=int(expense),
    )


async def get_transaction(db: AsyncSession, user_id: uuid.UUID, transaction_id: uuid.UUID) -> Transaction:
    row = (
        await db.execute(
            select(Transaction)
            .where(Transaction.id == transaction_id, Transaction.user_id == user_id)
            .options(*_eager())
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("Transaction not found.")
    return row


async def get_or_create_merchant(
    db: AsyncSession, user_id: uuid.UUID, name: str | None, default_category_id: uuid.UUID | None = None
) -> Merchant | None:
    if not name or not name.strip():
        return None
    normalized = normalize_name(name)
    if not normalized:
        return None
    merchant = (
        await db.execute(select(Merchant).where(Merchant.user_id == user_id, Merchant.normalized_name == normalized))
    ).scalar_one_or_none()
    if merchant is None:
        merchant = Merchant(user_id=user_id, name=name.strip()[:80], normalized_name=normalized[:80],
                            default_category_id=default_category_id)
        db.add(merchant)
        await db.flush()
    elif default_category_id and merchant.default_category_id != default_category_id:
        merchant.default_category_id = default_category_id
    return merchant


async def _tags(db: AsyncSession, user_id: uuid.UUID, names: list[str]) -> list[Tag]:
    tags: list[Tag] = []
    for name in dict.fromkeys(n.strip().lower() for n in names if n.strip()):
        tag = (await db.execute(select(Tag).where(Tag.user_id == user_id, Tag.name == name))).scalar_one_or_none()
        if tag is None:
            tag = Tag(user_id=user_id, name=name)
            db.add(tag)
            await db.flush()
        tags.append(tag)
    return tags


def _items(user_id: uuid.UUID, data: TransactionIn) -> list[TransactionItem]:
    items = []
    for pos, item in enumerate(data.items):
        unit = int((Decimal(item.amount_minor) / item.quantity).quantize(Decimal(1), rounding=ROUND_HALF_UP))
        items.append(TransactionItem(user_id=user_id, name=item.name, quantity=item.quantity,
                                     unit_amount_minor=unit, amount_minor=item.amount_minor, position=pos))
    return items


def _check_date(occurred_on: date) -> None:
    # Money that already moved: nothing dated after today. Today in UTC plus a day covers every timezone's today.
    if occurred_on > datetime.now(UTC).date() + timedelta(days=1):
        raise AppError("A transaction can't be dated in the future. Plan it as a bill or planned purchase instead.")


async def _validate_refs(db: AsyncSession, user_id: uuid.UUID, data: TransactionIn) -> tuple[Account, Category | None, Category | None]:
    _check_date(data.occurred_on)
    account = await get_owned(db, Account, data.account_id, user_id, "Account")
    if data.to_account_id:
        await get_owned(db, Account, data.to_account_id, user_id, "Destination account")
    if data.recurring_payment_id:
        await get_owned(db, RecurringPayment, data.recurring_payment_id, user_id, "Recurring payment")
    category, sub = await resolve_category_pair(db, user_id, data.category_id, data.subcategory_id)
    if data.type == TransactionType.transfer:
        category, sub = None, None
    elif category is not None:
        expected = CategoryKind.income if data.type == TransactionType.income else CategoryKind.expense
        if category.kind != expected:
            raise AppError(f"That category is for {category.kind.value}, not {data.type.value}.")
    return account, category, sub


async def create_transaction(
    db: AsyncSession, user_id: uuid.UUID, data: TransactionIn, source: TransactionSource = TransactionSource.manual
) -> Transaction:
    account, category, sub = await _validate_refs(db, user_id, data)
    merchant = await get_or_create_merchant(
        db, user_id, data.merchant, category.id if category and data.type == TransactionType.expense else None
    )
    txn = Transaction(
        user_id=user_id, type=data.type, amount_minor=data.amount_minor, currency=account.currency,
        occurred_on=data.occurred_on, account_id=account.id, to_account_id=data.to_account_id,
        merchant_id=merchant.id if merchant else None, category_id=category.id if category else None,
        subcategory_id=sub.id if sub else None, payment_method=data.payment_method, notes=data.notes,
        source=source, recurring_payment_id=data.recurring_payment_id,
    )
    txn.items = _items(user_id, data)
    txn.tags = await _tags(db, user_id, data.tags)
    db.add(txn)
    await db.flush()
    await _after_write(db, user_id, txn.id, [data.occurred_on])
    return await get_transaction(db, user_id, txn.id)


def _ensure_not_money_owed(txn: Transaction) -> None:
    if txn.debt_id is not None:
        raise Conflict("This is part of a money owed record. Change or delete it from Money owed.")


async def update_transaction(
    db: AsyncSession, user_id: uuid.UUID, transaction_id: uuid.UUID, data: TransactionIn
) -> Transaction:
    txn = await get_transaction(db, user_id, transaction_id)
    _ensure_not_money_owed(txn)
    previous_date = txn.occurred_on
    account, category, sub = await _validate_refs(db, user_id, data)
    merchant = await get_or_create_merchant(
        db, user_id, data.merchant, category.id if category and data.type == TransactionType.expense else None
    )
    txn.type = data.type
    txn.amount_minor = data.amount_minor
    txn.currency = account.currency
    txn.occurred_on = data.occurred_on
    txn.account_id = account.id
    txn.to_account_id = data.to_account_id
    txn.merchant_id = merchant.id if merchant else None
    txn.category_id = category.id if category else None
    txn.subcategory_id = sub.id if sub else None
    txn.payment_method = data.payment_method
    txn.notes = data.notes
    txn.recurring_payment_id = data.recurring_payment_id
    txn.items = _items(user_id, data)
    txn.tags = await _tags(db, user_id, data.tags)
    await db.flush()
    txn_id = txn.id
    db.expire(txn)
    await _after_write(db, user_id, txn_id, [previous_date, data.occurred_on])
    return await get_transaction(db, user_id, txn_id)


async def delete_transaction(db: AsyncSession, user_id: uuid.UUID, transaction_id: uuid.UUID) -> None:
    txn = await get_transaction(db, user_id, transaction_id)
    _ensure_not_money_owed(txn)
    occurred = txn.occurred_on
    item_ids = [i.id for i in txn.items]
    await db.delete(txn)
    await db.flush()
    await enqueue_unindex(db, user_id, "transaction", transaction_id)
    for item_id in item_ids:
        await enqueue_unindex(db, user_id, "transaction_item", item_id)
    await enqueue_monthly_summary(db, user_id, month_start(occurred))


async def _after_write(db: AsyncSession, user_id: uuid.UUID, transaction_id: uuid.UUID, dates: list[date]) -> None:
    await enqueue_index(db, user_id, "transaction", transaction_id)
    for month in {month_start(d) for d in dates}:
        await enqueue_monthly_summary(db, user_id, month)


async def list_merchants(db: AsyncSession, user_id: uuid.UUID, q: str | None, limit: int = 20) -> list[Merchant]:
    stmt = select(Merchant).where(Merchant.user_id == user_id)
    if q:
        normalized = normalize_name(q)
        stmt = stmt.where(
            or_(Merchant.normalized_name.ilike(f"%{normalized}%"), func.similarity(Merchant.normalized_name, normalized) > 0.3)
        ).order_by(func.similarity(Merchant.normalized_name, normalized).desc())
    else:
        stmt = stmt.order_by(Merchant.name)
    return list((await db.execute(stmt.limit(limit))).scalars().all())

