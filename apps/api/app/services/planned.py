"""Planned purchases: things you mean to buy, checked live against Safe to Spend.

Nothing here spends money. Buying one records a normal expense the user confirms.
"""
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.engine.check import CheckInputs, affordable_on, run_check
from app.engine.periods import add_months, month_start
from app.models import Category, PlannedPurchase
from app.models.enums import CategoryKind, TransactionSource, TransactionType
from app.models.identity import UserSettings
from app.schemas.ledger import TransactionIn
from app.schemas.planning import PlannedBuyIn, PlannedIn, PlannedOut, PlannedUpdate
from app.services.analytics import monthly_series
from app.services.common import apply_updates, get_owned
from app.services.forecast import safe_to_spend
from app.services.transactions import create_transaction

SURPLUS_MONTHS = 3


async def monthly_surplus(db: AsyncSession, user_id: uuid.UUID, today: date) -> int | None:
    """Average income minus spending over the last few full months. None without full-month history."""
    series = [m for m in await monthly_series(db, user_id, today, SURPLUS_MONTHS + 1) if not m["is_partial"]]
    months = [m for m in series if m["income_minor"] or m["expense_minor"]]
    if not months:
        return None
    return sum(m["net_minor"] for m in months) // len(months)


async def _category_names(db: AsyncSession, user_id: uuid.UUID) -> dict[uuid.UUID, str]:
    return {c.id: c.name for c in (await db.execute(select(Category).where(Category.user_id == user_id))).scalars()}


def _out(item: PlannedPurchase, now: datetime, names: dict[uuid.UUID, str], check: dict | None, when: date | None) -> PlannedOut:
    return PlannedOut(
        id=item.id, name=item.name, amount_minor=item.amount_minor, url=item.url, category_id=item.category_id,
        category_name=names.get(item.category_id) if item.category_id else None, target_date=item.target_date,
        priority=item.priority, notes=item.notes, status=item.status, pause_until=item.pause_until,
        is_paused=bool(item.pause_until and item.pause_until > now),
        verdict=check["verdict"] if check else None, safe_after_minor=check["safe_after_minor"] if check else None,
        over_by_minor=check["over_by_minor"] if check else None, affordable_on=when,
        affordable_is_estimate=bool(check and check["verdict"] == "over"),
        bought_transaction_id=item.bought_transaction_id, created_at=item.created_at,
    )


async def list_planned(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> list[PlannedOut]:
    rows = (await db.execute(
        select(PlannedPurchase).where(PlannedPurchase.user_id == user_id)
        .order_by(PlannedPurchase.status, PlannedPurchase.target_date.nulls_last(), PlannedPurchase.created_at)
    )).scalars().all()
    if not rows:
        return []
    names = await _category_names(db, user_id)
    now = datetime.now(UTC)
    planned = [r for r in rows if r.status == "planned"]
    sts = await safe_to_spend(db, user_id, settings, today) if planned else None
    surplus = await monthly_surplus(db, user_id, today) if planned else None
    out = []
    for item in rows:
        check = when = None
        if item.status == "planned" and sts is not None:
            check = run_check(CheckInputs(amount_minor=item.amount_minor, currency=settings.currency, safe_raw_minor=sts["raw_minor"],
                                          days_left=sts["days_left"], week_left_minor=sts["week"]["left_minor"],
                                          planned_savings_minor=0))
            when = affordable_on(item.amount_minor, sts["raw_minor"], surplus, today)
        out.append(_out(item, now, names, check, when))
    return out


async def _check_category(db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID | None) -> None:
    if category_id:
        category = await get_owned(db, Category, category_id, user_id, "Category")
        if category.kind != CategoryKind.expense:
            raise AppError("Choose an expense category.")


async def create_planned(db: AsyncSession, user_id: uuid.UUID, data: PlannedIn) -> PlannedPurchase:
    await _check_category(db, user_id, data.category_id)
    item = PlannedPurchase(
        user_id=user_id, name=data.name, amount_minor=data.amount_minor, url=data.url, category_id=data.category_id,
        target_date=data.target_date, priority=data.priority, notes=data.notes,
        pause_until=datetime.now(UTC) + timedelta(hours=data.pause_hours) if data.pause_hours else None,
    )
    db.add(item)
    await db.flush()
    return item


async def update_planned(db: AsyncSession, user_id: uuid.UUID, pid: uuid.UUID, data: PlannedUpdate) -> PlannedPurchase:
    item = await get_owned(db, PlannedPurchase, pid, user_id, "Planned purchase")
    updates = data.model_dump(exclude_unset=True)
    if item.status == "bought":
        raise AppError("This one is already bought.")
    await _check_category(db, user_id, updates.get("category_id"))
    apply_updates(item, updates)
    await db.flush()
    return item


async def delete_planned(db: AsyncSession, user_id: uuid.UUID, pid: uuid.UUID) -> None:
    await db.delete(await get_owned(db, PlannedPurchase, pid, user_id, "Planned purchase"))


async def buy_planned(db: AsyncSession, user_id: uuid.UUID, pid: uuid.UUID, data: PlannedBuyIn, today: date) -> PlannedPurchase:
    item = await get_owned(db, PlannedPurchase, pid, user_id, "Planned purchase")
    if item.status != "planned":
        raise AppError("Only planned items can be marked as bought.")
    on = data.occurred_on or today
    if on > today or on < add_months(month_start(today), -12):
        raise AppError("Choose a date within the last year.")
    txn = await create_transaction(db, user_id, TransactionIn(
        type=TransactionType.expense, amount_minor=item.amount_minor, occurred_on=on, account_id=data.account_id,
        category_id=item.category_id, notes=item.name,
    ), TransactionSource.manual)
    item.status = "bought"
    item.bought_transaction_id = txn.id
    await db.flush()
    return item
