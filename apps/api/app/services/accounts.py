import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict
from app.models import Account, Transaction
from app.models.enums import AccountType
from app.schemas.ledger import AccountIn, AccountOut, AccountUpdate
from app.services.common import apply_updates, get_owned

SPENDABLE_DEFAULTS = {
    AccountType.cash: True,
    AccountType.bank: True,
    AccountType.e_wallet: True,
    AccountType.credit_card: False,
    AccountType.savings: False,
    AccountType.custom: True,
}


@dataclass(frozen=True)
class AccountBalance:
    account: Account
    balance_minor: int
    transaction_count: int
    last_activity_on: date | None


def _signed_amount(account_col):
    return case(
        (and_(Transaction.type == "income", Transaction.account_id == account_col), Transaction.amount_minor),
        (and_(Transaction.type == "expense", Transaction.account_id == account_col), -Transaction.amount_minor),
        (and_(Transaction.type == "transfer", Transaction.account_id == account_col), -Transaction.amount_minor),
        (and_(Transaction.type == "transfer", Transaction.to_account_id == account_col), Transaction.amount_minor),
        else_=0,
    )


async def account_balances(
    db: AsyncSession, user_id: uuid.UUID, as_of: date | None = None, include_archived: bool = True
) -> list[AccountBalance]:
    join_cond = or_(Transaction.account_id == Account.id, Transaction.to_account_id == Account.id)
    if as_of is not None:
        join_cond = and_(join_cond, Transaction.occurred_on <= as_of)
    stmt = (
        select(
            Account,
            func.coalesce(func.sum(_signed_amount(Account.id)), 0),
            func.count(Transaction.id),
            func.max(Transaction.occurred_on),
        )
        .outerjoin(Transaction, join_cond)
        .where(Account.user_id == user_id)
        .group_by(Account.id)
        .order_by(Account.created_at)
    )
    if not include_archived:
        stmt = stmt.where(Account.archived_at.is_(None))
    rows = (await db.execute(stmt)).all()
    return [
        AccountBalance(account=a, balance_minor=a.opening_balance_minor + int(delta), transaction_count=count,
                       last_activity_on=last)
        for a, delta, count, last in rows
    ]


async def spendable_balance(db: AsyncSession, user_id: uuid.UUID, as_of: date | None = None) -> int:
    balances = await account_balances(db, user_id, as_of, include_archived=False)
    return sum(b.balance_minor for b in balances if b.account.is_spendable)


def to_out(b: AccountBalance) -> AccountOut:
    a = b.account
    return AccountOut(
        id=a.id, name=a.name, type=a.type, custom_type=a.custom_type, institution=a.institution,
        currency=a.currency, opening_balance_minor=a.opening_balance_minor, balance_minor=b.balance_minor,
        is_spendable=a.is_spendable, credit_limit_minor=a.credit_limit_minor, color=a.color,
        archived=a.archived_at is not None, transaction_count=b.transaction_count,
        last_activity_on=b.last_activity_on, updated_at=a.updated_at,
    )


async def create_account(db: AsyncSession, user_id: uuid.UUID, currency: str, data: AccountIn) -> Account:
    exists = await db.scalar(select(Account.id).where(Account.user_id == user_id, Account.name == data.name))
    if exists:
        raise Conflict("You already have an account with that name.")
    account = Account(
        user_id=user_id,
        name=data.name,
        type=data.type,
        custom_type=data.custom_type if data.type == AccountType.custom else None,
        institution=data.institution,
        currency=data.currency or currency,
        opening_balance_minor=data.opening_balance_minor,
        is_spendable=data.is_spendable if data.is_spendable is not None else SPENDABLE_DEFAULTS[data.type],
        credit_limit_minor=data.credit_limit_minor,
        color=data.color,
    )
    db.add(account)
    await db.flush()
    return account


async def update_account(db: AsyncSession, user_id: uuid.UUID, account_id: uuid.UUID, data: AccountUpdate) -> Account:
    account = await get_owned(db, Account, account_id, user_id, "Account")
    updates = data.model_dump(exclude_unset=True)
    archived = updates.pop("archived", None)
    if "name" in updates and updates["name"] != account.name:
        exists = await db.scalar(select(Account.id).where(Account.user_id == user_id, Account.name == updates["name"]))
        if exists:
            raise Conflict("You already have an account with that name.")
    apply_updates(account, updates)
    if archived is not None:
        account.archived_at = datetime.now(UTC) if archived else None
    await db.flush()
    return account


async def delete_account(db: AsyncSession, user_id: uuid.UUID, account_id: uuid.UUID) -> None:
    account = await get_owned(db, Account, account_id, user_id, "Account")
    used = await db.scalar(
        select(func.count(Transaction.id)).where(
            or_(Transaction.account_id == account_id, Transaction.to_account_id == account_id)
        )
    )
    if used:
        raise Conflict("This account has transactions. Archive it instead of deleting it.")
    await db.delete(account)
