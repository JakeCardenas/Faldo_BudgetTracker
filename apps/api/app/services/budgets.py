import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, NotFound
from app.engine.periods import add_months, month_end, month_key, month_start, parse_month
from app.engine.planning import budget_line_status
from app.jobs.queue import enqueue_index
from app.models import Budget, BudgetCategory
from app.models.enums import CategoryKind
from app.schemas.planning import BudgetLineOut, BudgetOut, BudgetUpsert
from app.services.analytics import category_meta, spending_by_category


async def get_budget_model(db: AsyncSession, user_id: uuid.UUID, month: date) -> Budget | None:
    return (
        await db.execute(
            select(Budget)
            .where(Budget.user_id == user_id, Budget.month == month_start(month))
            .options(selectinload(Budget.lines))
        )
    ).scalar_one_or_none()


async def budget_status(db: AsyncSession, user_id: uuid.UUID, month: date, today: date) -> BudgetOut:
    start = month_start(month)
    end = month_end(start)
    budget = await get_budget_model(db, user_id, start)
    meta = await category_meta(db, user_id)
    spent = await spending_by_category(db, user_id, start, min(end, today) if start <= today else end)
    prev_start = add_months(start, -1)
    prev = await spending_by_category(db, user_id, prev_start, month_end(prev_start))
    hist_start = add_months(start, -3)
    hist = await spending_by_category(db, user_id, hist_start, month_end(add_months(start, -1)))

    lines: list[BudgetLineOut] = []
    budgeted_ids: set[uuid.UUID] = set()
    for line in sorted(budget.lines if budget else [], key=lambda item: meta[item.category_id].name):
        cat = meta[line.category_id]
        budgeted_ids.add(line.category_id)
        status = budget_line_status(line.limit_minor, spent.get(line.category_id, 0), today, start)
        lines.append(BudgetLineOut(
            id=line.id, category_id=line.category_id, category_name=cat.name, category_color=cat.color,
            category_icon=cat.icon, **status.as_dict(),
            previous_spent_minor=prev.get(line.category_id, 0),
            average_spent_minor=round(hist.get(line.category_id, 0) / 3),
        ))

    history = []
    for i in range(5, -1, -1):
        m = add_months(start, -i)
        b = await get_budget_model(db, user_id, m)
        m_spent = await spending_by_category(db, user_id, m, month_end(m))
        budgeted = sum(line.limit_minor for line in b.lines) if b else 0
        history.append({
            "month": month_key(m),
            "label": m.strftime("%b"),
            "budgeted_minor": budgeted,
            "spent_minor": sum(v for k, v in m_spent.items() if b and k in {line.category_id for line in b.lines}),
            "total_spent_minor": sum(m_spent.values()),
        })

    total_spent_all = sum(spent.values())
    total_spent_budgeted = sum(v for k, v in spent.items() if k in budgeted_ids)
    return BudgetOut(
        id=budget.id if budget else None,
        month=month_key(start),
        total_limit_minor=budget.total_limit_minor if budget else None,
        total_budgeted_minor=sum(line.limit_minor for line in lines),
        total_spent_minor=total_spent_budgeted,
        total_spent_all_minor=total_spent_all,
        unbudgeted_spent_minor=total_spent_all - total_spent_budgeted,
        lines=lines,
        history=history,
    )


async def upsert_budget(db: AsyncSession, user_id: uuid.UUID, data: BudgetUpsert) -> Budget:
    month = parse_month(data.month)
    meta = await category_meta(db, user_id)
    seen: set[uuid.UUID] = set()
    for line in data.lines:
        cat = meta.get(line.category_id)
        if cat is None:
            raise NotFound("Category not found.")
        if cat.kind != CategoryKind.expense.value or cat.parent_id is not None:
            raise AppError(f"{cat.name} cannot be budgeted. Choose a top-level expense category.")
        if line.category_id in seen:
            raise AppError(f"{cat.name} appears more than once.")
        seen.add(line.category_id)

    budget = await get_budget_model(db, user_id, month)
    if budget is None:
        budget = Budget(user_id=user_id, month=month)
        db.add(budget)
    budget.total_limit_minor = data.total_limit_minor
    existing = {line.category_id: line for line in budget.lines} if budget.id else {}
    new_lines = []
    for line in data.lines:
        current = existing.get(line.category_id)
        if current:
            current.limit_minor = line.limit_minor
            new_lines.append(current)
        else:
            new_lines.append(BudgetCategory(user_id=user_id, category_id=line.category_id, limit_minor=line.limit_minor))
    budget.lines = new_lines
    await db.flush()
    await enqueue_index(db, user_id, "budget", budget.id)
    return budget


async def copy_previous_budget(db: AsyncSession, user_id: uuid.UUID, month: date) -> Budget:
    target = await get_budget_model(db, user_id, month)
    if target and target.lines:
        raise AppError("This month already has a budget.")
    source = None
    for i in range(1, 13):
        source = await get_budget_model(db, user_id, add_months(month_start(month), -i))
        if source and source.lines:
            break
    if not source or not source.lines:
        raise NotFound("No earlier budget to copy.")
    data = BudgetUpsert(
        month=month_key(month),
        total_limit_minor=source.total_limit_minor,
        lines=[{"category_id": line.category_id, "limit_minor": line.limit_minor} for line in source.lines],
    )
    return await upsert_budget(db, user_id, data)
