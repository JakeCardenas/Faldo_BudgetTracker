"""Money owed: IOUs, loans between people, and split purchases.

When money actually moves, the movement is a transaction linked to the debt (type debt_out / debt_in), so account
balances stay right while income and spending totals stay untouched. A split purchase keeps the user's share as the
expense and turns the other person's share into money owed, linked back to the original purchase.
"""
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, Conflict, NotFound
from app.engine.periods import month_start
from app.jobs.queue import enqueue_index, enqueue_monthly_summary, enqueue_unindex
from app.models import Account, Category, Debt, DebtPayment, Transaction
from app.models.enums import CategoryKind, DebtDirection, DebtStatus, TransactionSource, TransactionType
from app.schemas.ledger import SplitIn
from app.schemas.planning import DebtIn, DebtOut, DebtPaymentIn, DebtPaymentOut, DebtUpdate
from app.services.common import apply_updates, get_owned

# Which way money moves for each debt event.
START_TYPE = {DebtDirection.owed_to_me: TransactionType.debt_out, DebtDirection.i_owe: TransactionType.debt_in}
PAYMENT_TYPE = {DebtDirection.owed_to_me: TransactionType.debt_in, DebtDirection.i_owe: TransactionType.debt_out}


async def _load(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID, for_update: bool = False) -> Debt:
    stmt = select(Debt).where(Debt.id == debt_id, Debt.user_id == user_id).options(selectinload(Debt.payments))
    if for_update:
        # Lock the debt row first so its payments are read after any concurrent payment has committed.
        stmt = stmt.with_for_update(of=Debt).execution_options(populate_existing=True)
    debt = (await db.execute(stmt)).scalar_one_or_none()
    if debt is None:
        raise NotFound("Record not found.")
    return debt


async def _movements(db: AsyncSession, user_id: uuid.UUID, debt_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[Transaction]]:
    if not debt_ids:
        return {}
    rows = (await db.execute(
        select(Transaction).where(Transaction.user_id == user_id, Transaction.debt_id.in_(debt_ids))
        .options(selectinload(Transaction.account))
    )).scalars().all()
    out: dict[uuid.UUID, list[Transaction]] = {}
    for t in rows:
        if t.debt_id:
            out.setdefault(t.debt_id, []).append(t)
    return out


def _start_movement(debt: Debt, movements: list[Transaction]) -> Transaction | None:
    payment_ids = {p.transaction_id for p in debt.payments if p.transaction_id}
    return next((t for t in movements if t.id not in payment_ids), None)


def to_out(debt: Debt, today: date, movements: list[Transaction] | None = None) -> DebtOut:
    movements = movements or []
    by_id = {t.id: t for t in movements}
    paid = sum(p.amount_minor for p in debt.payments)
    outstanding = max(0, debt.amount_minor - paid)
    start = _start_movement(debt, movements)
    return DebtOut(
        id=debt.id, direction=debt.direction, counterparty=debt.counterparty, amount_minor=debt.amount_minor,
        paid_minor=paid, outstanding_minor=outstanding, due_on=debt.due_on,
        is_overdue=bool(debt.due_on and debt.due_on < today and debt.status == DebtStatus.open and outstanding > 0),
        status=debt.status, notes=debt.notes, started_on=debt.started_on,
        payments=[
            DebtPaymentOut(id=p.id, amount_minor=p.amount_minor, paid_on=p.paid_on, note=p.note, transaction_id=p.transaction_id,
                           account_name=by_id[p.transaction_id].account.name if p.transaction_id in by_id else None)
            for p in debt.payments
        ],
        account_name=start.account.name if start else None,
        source_transaction_id=debt.source_transaction_id,
    )


async def _out(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID, today: date) -> DebtOut:
    debt = await _load(db, user_id, debt_id)
    return to_out(debt, today, (await _movements(db, user_id, [debt.id])).get(debt.id, []))


async def list_debts(db: AsyncSession, user_id: uuid.UUID, today: date) -> list[DebtOut]:
    rows = (
        await db.execute(
            select(Debt).where(Debt.user_id == user_id).options(selectinload(Debt.payments))
            .order_by(Debt.status, Debt.due_on.nulls_last())
        )
    ).scalars().all()
    movements = await _movements(db, user_id, [d.id for d in rows])
    return [to_out(d, today, movements.get(d.id, [])) for d in rows]


async def _move_money(
    db: AsyncSession, user_id: uuid.UUID, debt: Debt, account_id: uuid.UUID, type_: TransactionType, amount_minor: int,
    on: date, note: str, category: Category | None = None,
) -> Transaction:
    account = await get_owned(db, Account, account_id, user_id, "Account")
    if account.archived_at is not None:
        raise AppError("That account is archived.")
    txn = Transaction(
        user_id=user_id, type=type_, amount_minor=amount_minor, currency=account.currency, occurred_on=on,
        account_id=account.id, debt_id=debt.id, notes=note[:500], source=TransactionSource.manual,
        category_id=(category.parent_id or category.id) if category else None,
        subcategory_id=category.id if category and category.parent_id else None,
    )
    db.add(txn)
    await db.flush()
    if type_ == TransactionType.expense:
        await enqueue_index(db, user_id, "transaction", txn.id)
        await enqueue_monthly_summary(db, user_id, month_start(on))
    return txn


def _describe(debt: Debt, event: str) -> str:
    person = debt.counterparty
    if debt.direction == DebtDirection.owed_to_me:
        return f"Lent to {person}" if event == "start" else f"{person} paid you back"
    return f"Borrowed from {person}" if event == "start" else f"Paid {person} back"


async def create_debt(db: AsyncSession, user_id: uuid.UUID, currency: str, data: DebtIn, today: date) -> DebtOut:
    started = data.started_on or today
    if data.account_id and started > today:
        raise AppError("Money that already moved can't be dated in the future.")
    debt = Debt(user_id=user_id, direction=data.direction, counterparty=data.counterparty, amount_minor=data.amount_minor,
                currency=currency, due_on=data.due_on, notes=data.notes, started_on=started)
    db.add(debt)
    await db.flush()
    if data.account_id:
        await _move_money(db, user_id, debt, data.account_id, START_TYPE[debt.direction], debt.amount_minor, started,
                          _describe(debt, "start"))
    await enqueue_index(db, user_id, "debt", debt.id)
    return await _out(db, user_id, debt.id, today)


async def update_debt(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID, data: DebtUpdate, today: date) -> DebtOut:
    debt = await _load(db, user_id, debt_id)
    updates = data.model_dump(exclude_unset=True)
    new_amount = updates.get("amount_minor")
    if new_amount is not None and new_amount != debt.amount_minor:
        paid = sum(p.amount_minor for p in debt.payments)
        if new_amount < paid:
            raise AppError("The amount can't be less than what has already been repaid.")
        delta = new_amount - debt.amount_minor
        start = _start_movement(debt, (await _movements(db, user_id, [debt.id])).get(debt.id, []))
        if start is not None:
            start.amount_minor = new_amount
        if debt.source_transaction_id:
            source = (await db.execute(
                select(Transaction).where(Transaction.id == debt.source_transaction_id, Transaction.user_id == user_id)
                .options(selectinload(Transaction.items))
            )).scalar_one_or_none()
            if source is not None:
                remaining = source.amount_minor - delta
                if remaining <= 0 or remaining < sum(i.amount_minor for i in source.items):
                    raise AppError("Their share can't be more than the purchase itself.")
                source.amount_minor = remaining
                await enqueue_index(db, user_id, "transaction", source.id)
                await enqueue_monthly_summary(db, user_id, month_start(source.occurred_on))
    apply_updates(debt, updates)
    await db.flush()
    await enqueue_index(db, user_id, "debt", debt.id)
    return await _out(db, user_id, debt.id, today)


async def delete_debt(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID) -> None:
    """Deleting a record removes its money movements. Deleting a split puts the full amount back on the purchase."""
    debt = await _load(db, user_id, debt_id)
    if debt.source_transaction_id:
        source = (await db.execute(
            select(Transaction).where(Transaction.id == debt.source_transaction_id, Transaction.user_id == user_id)
        )).scalar_one_or_none()
        if source is not None and source.type == TransactionType.expense:
            source.amount_minor += debt.amount_minor
            await enqueue_index(db, user_id, "transaction", source.id)
            await enqueue_monthly_summary(db, user_id, month_start(source.occurred_on))
    for movement in (await _movements(db, user_id, [debt.id])).get(debt.id, []):
        if movement.type == TransactionType.expense:
            await enqueue_unindex(db, user_id, "transaction", movement.id)
            await enqueue_monthly_summary(db, user_id, month_start(movement.occurred_on))
    await db.delete(debt)
    await db.flush()
    await enqueue_unindex(db, user_id, "debt", debt_id)


async def add_payment(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID, data: DebtPaymentIn, today: date) -> DebtOut:
    debt = await _load(db, user_id, debt_id, for_update=True)
    if debt.status != DebtStatus.open:
        raise AppError("This record is already closed.")
    outstanding = debt.amount_minor - sum(p.amount_minor for p in debt.payments)
    if data.amount_minor > outstanding:
        raise AppError("The payment is more than what is outstanding.")
    if data.paid_on > today:
        raise AppError("Payments cannot be dated in the future.")
    category = None
    if data.category_id:
        if debt.direction != DebtDirection.i_owe or not data.account_id:
            raise AppError("Only a repayment you make from an account can count as spending.")
        category = await get_owned(db, Category, data.category_id, user_id, "Category")
        if category.kind != CategoryKind.expense:
            raise AppError("Choose an expense category.")
    transaction_id = None
    if data.account_id:
        type_ = TransactionType.expense if category else PAYMENT_TYPE[debt.direction]
        txn = await _move_money(db, user_id, debt, data.account_id, type_, data.amount_minor, data.paid_on,
                                data.note or _describe(debt, "payment"), category)
        transaction_id = txn.id
    debt.payments.append(DebtPayment(user_id=user_id, amount_minor=data.amount_minor, paid_on=data.paid_on, note=data.note,
                                     transaction_id=transaction_id))
    if data.amount_minor == outstanding:
        debt.status = DebtStatus.settled
    await db.flush()
    await enqueue_index(db, user_id, "debt", debt.id)
    return await _out(db, user_id, debt.id, today)


async def split_transaction(
    db: AsyncSession, user_id: uuid.UUID, transaction_id: uuid.UUID, data: SplitIn, today: date,
) -> DebtOut:
    """Someone else owes part of a purchase you paid for: your share stays spending, theirs becomes money owed."""
    txn = (await db.execute(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user_id)
        .options(selectinload(Transaction.items), selectinload(Transaction.merchant))
    )).scalar_one_or_none()
    if txn is None:
        raise NotFound("Transaction not found.")
    if txn.type != TransactionType.expense or txn.debt_id is not None:
        raise AppError("Only a purchase you paid for can be split.")
    if data.amount_minor >= txn.amount_minor:
        raise AppError("Their share must be less than the whole purchase.")
    my_share = txn.amount_minor - data.amount_minor
    if sum(i.amount_minor for i in txn.items) > my_share:
        raise Conflict("The items on this purchase add up to more than your share. Remove items first.")
    txn.amount_minor = my_share
    debt = Debt(user_id=user_id, direction=DebtDirection.owed_to_me, counterparty=data.counterparty,
                amount_minor=data.amount_minor, currency=txn.currency, due_on=data.due_on, notes=data.notes,
                started_on=txn.occurred_on, source_transaction_id=txn.id)
    db.add(debt)
    await db.flush()
    what = txn.merchant.name if txn.merchant else (txn.notes or "a purchase")
    await _move_money(db, user_id, debt, txn.account_id, TransactionType.debt_out, data.amount_minor, txn.occurred_on,
                      f"{data.counterparty}'s share of {what}")
    await enqueue_index(db, user_id, "transaction", txn.id)
    await enqueue_monthly_summary(db, user_id, month_start(txn.occurred_on))
    await enqueue_index(db, user_id, "debt", debt.id)
    return await _out(db, user_id, debt.id, today)
