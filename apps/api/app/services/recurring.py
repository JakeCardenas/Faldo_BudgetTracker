import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.engine.planning import advance_due_date, monthly_equivalent, occurrences_between
from app.jobs.queue import enqueue_index, enqueue_unindex
from app.models import Account, Category, Merchant, RecurringPayment
from app.models.enums import Frequency, RecurringKind, TransactionSource, TransactionType
from app.schemas.ledger import TransactionIn
from app.schemas.planning import MarkPaidIn, RecurringIn, RecurringOut, RecurringUpdate
from app.services.common import apply_updates, get_owned
from app.services.transactions import create_transaction, get_or_create_merchant


async def list_recurring(db: AsyncSession, user_id: uuid.UUID, today: date, active_only: bool = False) -> list[RecurringOut]:
    stmt = select(RecurringPayment).where(RecurringPayment.user_id == user_id)
    if active_only:
        stmt = stmt.where(RecurringPayment.is_active.is_(True))
    rows = (await db.execute(stmt.order_by(RecurringPayment.next_due_on))).scalars().all()
    accounts = {a.id: a.name for a in (await db.execute(select(Account).where(Account.user_id == user_id))).scalars()}
    categories = {c.id: c.name for c in (await db.execute(select(Category).where(Category.user_id == user_id))).scalars()}
    merchants = {m.id: m.name for m in (await db.execute(select(Merchant).where(Merchant.user_id == user_id))).scalars()}
    return [
        RecurringOut(
            id=r.id, name=r.name, kind=r.kind, amount_minor=r.amount_minor,
            monthly_equivalent_minor=monthly_equivalent(r.amount_minor, r.frequency.value, r.interval_count),
            is_amount_variable=r.is_amount_variable, frequency=r.frequency, interval_count=r.interval_count,
            next_due_on=r.next_due_on, days_until_due=(r.next_due_on - today).days, end_on=r.end_on,
            account_id=r.account_id, account_name=accounts.get(r.account_id) if r.account_id else None,
            category_id=r.category_id, category_name=categories.get(r.category_id) if r.category_id else None,
            merchant=merchants.get(r.merchant_id) if r.merchant_id else None, is_active=r.is_active, notes=r.notes,
        )
        for r in rows
    ]


def _anchor(frequency: str, due: date) -> int | None:
    return due.day if frequency in {"monthly", "quarterly", "yearly"} else None


def _check_due(next_due_on: date) -> None:
    # Up to a year overdue, up to five years ahead. Anything else is a mistyped year, and the forecast would count every
    # missed occurrence since then.
    today = datetime.now(UTC).date()
    if next_due_on < today - timedelta(days=366):
        raise AppError("That due date is more than a year ago. Pick the next date it's actually due.")
    if next_due_on > today + timedelta(days=5 * 366):
        raise AppError("That due date is more than five years away. Check the year.")


async def create_recurring(db: AsyncSession, user_id: uuid.UUID, currency: str, data: RecurringIn) -> RecurringPayment:
    _check_due(data.next_due_on)
    if data.account_id:
        await get_owned(db, Account, data.account_id, user_id, "Account")
    if data.category_id:
        await get_owned(db, Category, data.category_id, user_id, "Category")
    merchant = await get_or_create_merchant(db, user_id, data.merchant)
    item = RecurringPayment(
        user_id=user_id, name=data.name, kind=data.kind, amount_minor=data.amount_minor, currency=currency,
        is_amount_variable=data.is_amount_variable, frequency=data.frequency, interval_count=data.interval_count,
        next_due_on=data.next_due_on, anchor_day=_anchor(data.frequency.value, data.next_due_on),
        end_on=data.end_on, account_id=data.account_id, category_id=data.category_id,
        merchant_id=merchant.id if merchant else None, notes=data.notes,
    )
    db.add(item)
    await db.flush()
    await enqueue_index(db, user_id, "recurring_payment", item.id)
    return item


async def update_recurring(db: AsyncSession, user_id: uuid.UUID, rid: uuid.UUID, data: RecurringUpdate) -> RecurringPayment:
    item = await get_owned(db, RecurringPayment, rid, user_id, "Recurring payment")
    updates = data.model_dump(exclude_unset=True)
    if updates.get("next_due_on"):
        _check_due(updates["next_due_on"])
    if updates.get("account_id"):
        await get_owned(db, Account, updates["account_id"], user_id, "Account")
    if updates.get("category_id"):
        await get_owned(db, Category, updates["category_id"], user_id, "Category")
    apply_updates(item, updates)
    if "next_due_on" in updates or "frequency" in updates:
        item.anchor_day = _anchor(item.frequency.value, item.next_due_on)
    await db.flush()
    await enqueue_index(db, user_id, "recurring_payment", item.id)
    return item


async def delete_recurring(db: AsyncSession, user_id: uuid.UUID, rid: uuid.UUID) -> None:
    item = await get_owned(db, RecurringPayment, rid, user_id, "Recurring payment")
    await db.delete(item)
    await enqueue_unindex(db, user_id, "recurring_payment", rid)


async def mark_paid(db: AsyncSession, user_id: uuid.UUID, rid: uuid.UUID, data: MarkPaidIn, today: date):
    item = await get_owned(db, RecurringPayment, rid, user_id, "Recurring payment")
    account_id = data.account_id or item.account_id
    if not account_id:
        raise AppError("Choose which account this was paid from.")
    merchant_name = None
    if item.merchant_id:
        merchant = await db.get(Merchant, item.merchant_id)
        merchant_name = merchant.name if merchant else None
    is_income = item.kind == RecurringKind.income
    txn = await create_transaction(
        db, user_id,
        TransactionIn(
            type=TransactionType.income if is_income else TransactionType.expense,
            amount_minor=data.amount_minor or item.amount_minor,
            occurred_on=data.paid_on or today,
            account_id=account_id,
            merchant=merchant_name or item.name,
            category_id=item.category_id,
            recurring_payment_id=item.id,
            notes=None,
        ),
        TransactionSource.recurring,
    )
    if item.frequency == Frequency.once:
        item.is_active = False  # it arrived (or was paid); a one-time item doesn't come back
    else:
        item.next_due_on = advance_due_date(item.next_due_on, item.frequency.value, item.interval_count, item.anchor_day)
        if item.end_on and item.next_due_on > item.end_on:
            item.is_active = False
    await db.flush()
    await enqueue_index(db, user_id, "recurring_payment", item.id)
    return txn


async def skip_occurrence(db: AsyncSession, user_id: uuid.UUID, rid: uuid.UUID) -> RecurringPayment:
    item = await get_owned(db, RecurringPayment, rid, user_id, "Recurring payment")
    if item.frequency == Frequency.once:
        item.is_active = False
    else:
        item.next_due_on = advance_due_date(item.next_due_on, item.frequency.value, item.interval_count, item.anchor_day)
    await db.flush()
    return item


async def upcoming(db: AsyncSession, user_id: uuid.UUID, today: date, end: date, include_income: bool = True) -> list[dict]:
    rows = (
        await db.execute(
            select(RecurringPayment).where(RecurringPayment.user_id == user_id, RecurringPayment.is_active.is_(True))
        )
    ).scalars().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        if r.kind == RecurringKind.income and not include_income:
            continue
        start = min(r.next_due_on, today)
        for due in occurrences_between(r.next_due_on, r.frequency.value, r.interval_count, start, end, r.end_on, r.anchor_day):
            out.append({
                "recurring_payment_id": str(r.id),
                "name": r.name,
                "kind": r.kind.value,
                "amount_minor": r.amount_minor,
                "due_on": due.isoformat(),
                "days_until_due": (due - today).days,
                "is_overdue": due < today,
                "is_income": r.kind == RecurringKind.income,
                "is_one_time": r.frequency == Frequency.once,
                "category_id": str(r.category_id) if r.category_id else None,
                "account_id": str(r.account_id) if r.account_id else None,
            })
    out.sort(key=lambda o: str(o["due_on"]))
    return out
