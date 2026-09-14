import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.analysis import compare_breakdowns, share_rows
from app.engine.money import percent
from app.engine.periods import Period, add_months, month_end, month_key, month_start
from app.models import Category, Merchant, Transaction, TransactionItem
from app.models.enums import TransactionType


@dataclass(frozen=True)
class CategoryMeta:
    id: uuid.UUID
    name: str
    color: str | None
    icon: str | None
    is_essential: bool
    parent_id: uuid.UUID | None
    kind: str


async def category_meta(db: AsyncSession, user_id: uuid.UUID) -> dict[uuid.UUID, CategoryMeta]:
    rows = (await db.execute(select(Category).where(Category.user_id == user_id))).scalars().all()
    return {
        c.id: CategoryMeta(c.id, c.name, c.color, c.icon, c.is_essential, c.parent_id, c.kind.value) for c in rows
    }


async def totals_by_type(db: AsyncSession, user_id: uuid.UUID, start: date, end: date) -> dict[str, int]:
    rows = (
        await db.execute(
            select(Transaction.type, func.coalesce(func.sum(Transaction.amount_minor), 0), func.count(Transaction.id))
            .where(Transaction.user_id == user_id, Transaction.occurred_on.between(start, end))
            .group_by(Transaction.type)
        )
    ).all()
    out = {"income": 0, "expense": 0, "transfer": 0, "count": 0}
    for t, amount, count in rows:
        out[t.value] = int(amount)
        out["count"] += count
    return out


async def spending_by_category(
    db: AsyncSession, user_id: uuid.UUID, start: date, end: date, kind: TransactionType = TransactionType.expense
) -> dict[uuid.UUID | None, int]:
    rows = (
        await db.execute(
            select(Transaction.category_id, func.sum(Transaction.amount_minor))
            .where(Transaction.user_id == user_id, Transaction.type == kind, Transaction.occurred_on.between(start, end))
            .group_by(Transaction.category_id)
        )
    ).all()
    return {cid: int(total) for cid, total in rows}


async def spending_by_subcategory(
    db: AsyncSession, user_id: uuid.UUID, start: date, end: date, category_id: uuid.UUID
) -> dict[uuid.UUID | None, int]:
    rows = (
        await db.execute(
            select(Transaction.subcategory_id, func.sum(Transaction.amount_minor))
            .where(Transaction.user_id == user_id, Transaction.type == TransactionType.expense,
                   Transaction.category_id == category_id, Transaction.occurred_on.between(start, end))
            .group_by(Transaction.subcategory_id)
        )
    ).all()
    return {cid: int(total) for cid, total in rows}


async def spending_by_merchant(
    db: AsyncSession, user_id: uuid.UUID, start: date, end: date, limit: int = 10
) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(Merchant.id, Merchant.name, func.sum(Transaction.amount_minor), func.count(Transaction.id))
            .join(Merchant, Merchant.id == Transaction.merchant_id)
            .where(Transaction.user_id == user_id, Transaction.type == TransactionType.expense,
                   Transaction.occurred_on.between(start, end))
            .group_by(Merchant.id, Merchant.name)
            .order_by(func.sum(Transaction.amount_minor).desc())
            .limit(limit)
        )
    ).all()
    return [{"merchant_id": str(mid), "name": name, "amount_minor": int(total), "count": count}
            for mid, name, total, count in rows]


async def top_items(db: AsyncSession, user_id: uuid.UUID, start: date, end: date, limit: int = 10) -> list[dict[str, Any]]:
    name_key = func.lower(TransactionItem.name)
    rows = (
        await db.execute(
            select(func.min(TransactionItem.name), func.sum(TransactionItem.amount_minor), func.count(TransactionItem.id))
            .join(Transaction, Transaction.id == TransactionItem.transaction_id)
            .where(TransactionItem.user_id == user_id, Transaction.type == TransactionType.expense,
                   Transaction.occurred_on.between(start, end))
            .group_by(name_key)
            .order_by(func.sum(TransactionItem.amount_minor).desc())
            .limit(limit)
        )
    ).all()
    return [{"name": name, "amount_minor": int(total), "count": count} for name, total, count in rows]


async def daily_totals(
    db: AsyncSession, user_id: uuid.UUID, start: date, end: date, kind: TransactionType = TransactionType.expense,
    exclude_recurring: bool = False, max_amount_minor: int | None = None,
) -> dict[date, int]:
    stmt = (
        select(Transaction.occurred_on, func.sum(Transaction.amount_minor))
        .where(Transaction.user_id == user_id, Transaction.type == kind, Transaction.occurred_on.between(start, end))
        .group_by(Transaction.occurred_on)
    )
    if exclude_recurring:
        stmt = stmt.where(Transaction.recurring_payment_id.is_(None))
    if max_amount_minor is not None:
        stmt = stmt.where(Transaction.amount_minor <= max_amount_minor)
    rows = (await db.execute(stmt)).all()
    return {d: int(total) for d, total in rows}


async def monthly_series(db: AsyncSession, user_id: uuid.UUID, today: date, months: int = 6) -> list[dict[str, Any]]:
    first = add_months(month_start(today), -(months - 1))
    bucket = cast(func.date_trunc("month", Transaction.occurred_on), Date)
    rows = (
        await db.execute(
            select(bucket, Transaction.type, func.sum(Transaction.amount_minor))
            .where(Transaction.user_id == user_id, Transaction.occurred_on >= first, Transaction.occurred_on <= today,
                   Transaction.type != TransactionType.transfer)
            .group_by(bucket, Transaction.type)
        )
    ).all()
    data: dict[str, dict[str, int]] = {}
    for m, t, total in rows:
        data.setdefault(month_key(m), {})[t.value] = int(total)
    series = []
    for i in range(months):
        m = add_months(first, i)
        values = data.get(month_key(m), {})
        income, expense = values.get("income", 0), values.get("expense", 0)
        series.append({
            "month": month_key(m),
            "label": m.strftime("%b"),
            "income_minor": income,
            "expense_minor": expense,
            "net_minor": income - expense,
            "savings_rate": percent(income - expense, income) if income else None,
            "is_partial": m == month_start(today),
        })
    return series


async def first_activity_on(db: AsyncSession, user_id: uuid.UUID) -> date | None:
    return await db.scalar(select(func.min(Transaction.occurred_on)).where(Transaction.user_id == user_id))


async def history_days(db: AsyncSession, user_id: uuid.UUID, today: date) -> int:
    first = await first_activity_on(db, user_id)
    return (today - first).days + 1 if first else 0


def category_rows(
    totals: dict[uuid.UUID | None, int], meta: dict[uuid.UUID, CategoryMeta], limit: int | None = None
) -> list[dict[str, Any]]:
    labels = {str(k): (meta[k].name if k in meta else "Uncategorized") for k in totals}
    rows = share_rows({str(k): v for k, v in totals.items()}, labels, limit)
    for row in rows:
        m = meta.get(uuid.UUID(row["key"])) if row["key"] != "None" else None
        row["category_id"] = row.pop("key") if m else None
        row["color"] = m.color if m else "#9CA3AF"
        row["icon"] = m.icon if m else "circle-dashed"
    return rows


async def compare_spending(
    db: AsyncSession, user_id: uuid.UUID, current: Period, previous: Period
) -> dict[str, Any]:
    meta = await category_meta(db, user_id)
    cur = await spending_by_category(db, user_id, current.start, current.end)
    prev = await spending_by_category(db, user_id, previous.start, previous.end)
    labels = {str(k): (meta[k].name if k in meta else "Uncategorized") for k in set(cur) | set(prev)}
    result = compare_breakdowns({str(k): v for k, v in cur.items()}, {str(k): v for k, v in prev.items()}, labels)
    result["current_period"] = current.as_dict()
    result["previous_period"] = previous.as_dict()
    return result


def month_bounds(month: date, today: date) -> tuple[date, date]:
    start = month_start(month)
    return start, min(month_end(start), today) if start <= today else month_end(start)
