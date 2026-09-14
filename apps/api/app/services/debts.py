import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, NotFound
from app.jobs.queue import enqueue_index, enqueue_unindex
from app.models import Debt, DebtPayment
from app.models.enums import DebtStatus
from app.schemas.planning import DebtIn, DebtOut, DebtPaymentIn, DebtPaymentOut, DebtUpdate
from app.services.common import apply_updates


async def _load(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID) -> Debt:
    debt = (
        await db.execute(
            select(Debt).where(Debt.id == debt_id, Debt.user_id == user_id).options(selectinload(Debt.payments))
        )
    ).scalar_one_or_none()
    if debt is None:
        raise NotFound("Record not found.")
    return debt


def to_out(debt: Debt, today: date) -> DebtOut:
    paid = sum(p.amount_minor for p in debt.payments)
    outstanding = max(0, debt.amount_minor - paid)
    return DebtOut(
        id=debt.id, direction=debt.direction, counterparty=debt.counterparty, amount_minor=debt.amount_minor,
        paid_minor=paid, outstanding_minor=outstanding, due_on=debt.due_on,
        is_overdue=bool(debt.due_on and debt.due_on < today and debt.status == DebtStatus.open and outstanding > 0),
        status=debt.status, notes=debt.notes, started_on=debt.started_on,
        payments=[DebtPaymentOut.model_validate(p) for p in debt.payments],
    )


async def list_debts(db: AsyncSession, user_id: uuid.UUID, today: date) -> list[DebtOut]:
    rows = (
        await db.execute(
            select(Debt).where(Debt.user_id == user_id).options(selectinload(Debt.payments))
            .order_by(Debt.status, Debt.due_on.nulls_last())
        )
    ).scalars().all()
    return [to_out(d, today) for d in rows]


async def create_debt(db: AsyncSession, user_id: uuid.UUID, currency: str, data: DebtIn, today: date) -> DebtOut:
    debt = Debt(user_id=user_id, direction=data.direction, counterparty=data.counterparty, amount_minor=data.amount_minor,
                currency=currency, due_on=data.due_on, notes=data.notes, started_on=data.started_on or today)
    db.add(debt)
    await db.flush()
    await enqueue_index(db, user_id, "debt", debt.id)
    return to_out(await _load(db, user_id, debt.id), today)


async def update_debt(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID, data: DebtUpdate, today: date) -> DebtOut:
    debt = await _load(db, user_id, debt_id)
    apply_updates(debt, data.model_dump(exclude_unset=True))
    await db.flush()
    await enqueue_index(db, user_id, "debt", debt.id)
    return to_out(debt, today)


async def delete_debt(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID) -> None:
    debt = await _load(db, user_id, debt_id)
    await db.delete(debt)
    await enqueue_unindex(db, user_id, "debt", debt_id)


async def add_payment(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID, data: DebtPaymentIn, today: date) -> DebtOut:
    debt = await _load(db, user_id, debt_id)
    if debt.status != DebtStatus.open:
        raise AppError("This record is already closed.")
    outstanding = debt.amount_minor - sum(p.amount_minor for p in debt.payments)
    if data.amount_minor > outstanding:
        raise AppError("The payment is more than what is outstanding.")
    if data.paid_on > today:
        raise AppError("Payments cannot be dated in the future.")
    debt.payments.append(DebtPayment(user_id=user_id, amount_minor=data.amount_minor, paid_on=data.paid_on, note=data.note))
    if data.amount_minor == outstanding:
        debt.status = DebtStatus.settled
    await db.flush()
    await enqueue_index(db, user_id, "debt", debt.id)
    return to_out(debt, today)
