import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine.money import format_money, percent
from app.engine.periods import month_end, month_key, parse_month
from app.engine.planning import monthly_equivalent
from app.models import (
    Account,
    AIInsight,
    Budget,
    Category,
    Debt,
    FinancialNote,
    Merchant,
    RecurringPayment,
    SavingsGoal,
    Transaction,
)
from app.models.enums import TransactionType

TYPE_LABELS = {TransactionType.debt_in: "Money owed (received)", TransactionType.debt_out: "Money owed (paid out)"}


@dataclass
class RenderedDocument:
    entity_type: str
    entity_id: uuid.UUID
    content: str
    occurred_on: date | None = None
    category_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    amount_minor: int | None = None
    provenance: str = "user"
    metadata: dict[str, Any] = field(default_factory=dict)


ENTITY_TYPES = (
    "transaction",
    "transaction_item",
    "monthly_summary",
    "budget",
    "goal",
    "recurring_payment",
    "debt",
    "financial_note",
    "insight",
)


async def _names(db: AsyncSession, user_id: uuid.UUID) -> tuple[dict[uuid.UUID, Category], dict[uuid.UUID, str]]:
    categories = {c.id: c for c in (await db.execute(select(Category).where(Category.user_id == user_id))).scalars()}
    accounts = {a.id: a.name for a in (await db.execute(select(Account).where(Account.user_id == user_id))).scalars()}
    return categories, accounts


async def render_transaction(db: AsyncSession, user_id: uuid.UUID, txn_id: uuid.UUID) -> list[RenderedDocument]:
    txn = (
        await db.execute(
            select(Transaction)
            .where(Transaction.id == txn_id, Transaction.user_id == user_id)
            .options(selectinload(Transaction.items), selectinload(Transaction.tags))
        )
    ).scalar_one_or_none()
    if txn is None:
        return []
    categories, accounts = await _names(db, user_id)
    merchant = await db.get(Merchant, txn.merchant_id) if txn.merchant_id else None
    cat = categories.get(txn.category_id) if txn.category_id else None
    sub = categories.get(txn.subcategory_id) if txn.subcategory_id else None
    money = format_money(txn.amount_minor, txn.currency, cents=True)
    type_label = TYPE_LABELS.get(txn.type, txn.type.value.title())
    lines = [f"[transaction] {txn.occurred_on:%Y-%m-%d (%A)} · {type_label} · {money}"]
    if merchant:
        lines.append(f"Merchant: {merchant.name}")
    if txn.type == TransactionType.transfer:
        lines.append(f"From: {accounts.get(txn.account_id)} → To: {accounts.get(txn.to_account_id) if txn.to_account_id else ''}")
    else:
        cat_label = f"{cat.name} › {sub.name}" if cat and sub else (cat.name if cat else "Uncategorized")
        lines.append(f"Category: {cat_label} · Account: {accounts.get(txn.account_id)}")
    if txn.payment_method:
        lines.append(f"Payment method: {txn.payment_method}")
    if txn.items:
        rendered = "; ".join(f"{i.name} ({format_money(i.amount_minor, txn.currency, cents=True)})" for i in txn.items)
        lines.append(f"Items: {rendered}")
    if txn.tags:
        lines.append("Tags: " + ", ".join(sorted(t.name for t in txn.tags)))
    if txn.notes:
        lines.append(f"Note: {txn.notes}")
    docs = [RenderedDocument(
        "transaction", txn.id, "\n".join(lines), txn.occurred_on, txn.category_id, txn.account_id, txn.amount_minor,
        "user", {"transaction_id": str(txn.id), "type": txn.type.value, "merchant": merchant.name if merchant else None},
    )]
    for item in txn.items:
        item_lines = [
            f"[purchase item] {item.name} · {format_money(item.amount_minor, txn.currency, cents=True)} · qty {item.quantity.normalize()}",
            f"Bought on {txn.occurred_on:%Y-%m-%d}" + (f" at {merchant.name}" if merchant else ""),
            f"Category: {cat.name if cat else 'Uncategorized'}" + (f" › {sub.name}" if sub else ""),
        ]
        docs.append(RenderedDocument(
            "transaction_item", item.id, "\n".join(item_lines), txn.occurred_on, txn.category_id, txn.account_id,
            item.amount_minor, "user",
            {"transaction_id": str(txn.id), "item_name": item.name, "merchant": merchant.name if merchant else None,
             "category": cat.name if cat else None, "subcategory": sub.name if sub else None, "item_count": len(txn.items)},
        ))
    return docs


async def render_monthly_summary(db: AsyncSession, user_id: uuid.UUID, month: date, currency: str) -> RenderedDocument | None:
    from app.services.analytics import category_meta, spending_by_category, spending_by_merchant, totals_by_type

    start, end = month, month_end(month)
    totals = await totals_by_type(db, user_id, start, end)
    if totals["count"] == 0:
        return None
    meta = await category_meta(db, user_id)
    by_cat = await spending_by_category(db, user_id, start, end)
    merchants = await spending_by_merchant(db, user_id, start, end, 5)
    net = totals["income"] - totals["expense"]
    rate = percent(net, totals["income"]) if totals["income"] else None
    m = lambda v: format_money(v, currency)  # noqa: E731
    top = sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)[:6]
    lines = [
        f"[monthly summary] {start:%B %Y}",
        f"Income {m(totals['income'])} · Expenses {m(totals['expense'])} · Net {m(net)}"
        + (f" · Savings rate {rate:g}%" if rate is not None else ""),
        "Top categories: " + "; ".join(f"{meta[k].name if k in meta else 'Uncategorized'} {m(v)}" for k, v in top),
    ]
    if merchants:
        lines.append("Top merchants: " + "; ".join(f"{x['name']} {m(x['amount_minor'])} ({x['count']}×)" for x in merchants))
    lines.append(f"{totals['count']} transactions")
    from app.services.transactions import monthly_summary_entity_id

    return RenderedDocument(
        "monthly_summary", monthly_summary_entity_id(user_id, start), "\n".join(lines), end, None, None,
        totals["expense"], "system", {"month": month_key(start)},
    )


async def render_budget(db: AsyncSession, user_id: uuid.UUID, budget_id: uuid.UUID, currency: str) -> RenderedDocument | None:
    budget = (
        await db.execute(select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id).options(selectinload(Budget.lines)))
    ).scalar_one_or_none()
    if budget is None:
        return None
    categories, _ = await _names(db, user_id)
    lines = [f"[budget] {budget.month:%B %Y}"]
    lines += [f"{categories[line.category_id].name}: limit {format_money(line.limit_minor, currency)}" for line in budget.lines
              if line.category_id in categories]
    return RenderedDocument("budget", budget.id, "\n".join(lines), budget.month, provenance="user",
                            metadata={"month": month_key(budget.month)})


async def render_goal(db: AsyncSession, user_id: uuid.UUID, goal_id: uuid.UUID) -> RenderedDocument | None:
    goal = (await db.execute(select(SavingsGoal).where(SavingsGoal.id == goal_id, SavingsGoal.user_id == user_id))).scalar_one_or_none()
    if goal is None:
        return None
    lines = [f"[savings goal] {goal.name} · target {format_money(goal.target_minor, goal.currency)}"]
    if goal.target_date:
        lines.append(f"Target date: {goal.target_date:%B %Y}")
    if goal.monthly_contribution_minor:
        lines.append(f"Planned monthly contribution: {format_money(goal.monthly_contribution_minor, goal.currency)}")
    lines.append(f"Status: {goal.status.value}")
    if goal.notes:
        lines.append(f"Note: {goal.notes}")
    return RenderedDocument("goal", goal.id, "\n".join(lines), goal.target_date, amount_minor=goal.target_minor,
                            metadata={"goal_name": goal.name})


async def render_recurring(db: AsyncSession, user_id: uuid.UUID, rid: uuid.UUID) -> RenderedDocument | None:
    r = (await db.execute(select(RecurringPayment).where(RecurringPayment.id == rid, RecurringPayment.user_id == user_id))).scalar_one_or_none()
    if r is None:
        return None
    monthly = monthly_equivalent(r.amount_minor, r.frequency.value, r.interval_count)
    lines = [
        f"[recurring {r.kind.value}] {r.name} · {format_money(r.amount_minor, r.currency)} {r.frequency.value.replace('_', '-')}",
        f"About {format_money(monthly, r.currency)} per month · next due {r.next_due_on:%Y-%m-%d}",
        "Active" if r.is_active else "Paused",
    ]
    if r.notes:
        lines.append(f"Note: {r.notes}")
    return RenderedDocument("recurring_payment", r.id, "\n".join(lines), r.next_due_on, r.category_id, r.account_id,
                            r.amount_minor, metadata={"name": r.name, "kind": r.kind.value})


async def render_debt(db: AsyncSession, user_id: uuid.UUID, debt_id: uuid.UUID) -> RenderedDocument | None:
    d = (await db.execute(select(Debt).where(Debt.id == debt_id, Debt.user_id == user_id).options(selectinload(Debt.payments)))).scalar_one_or_none()
    if d is None:
        return None
    direction = "I owe" if d.direction.value == "i_owe" else "Owed to me by"
    paid = sum(p.amount_minor for p in d.payments)
    lines = [
        f"[debt] {direction} {d.counterparty} · {format_money(d.amount_minor, d.currency)} · status {d.status.value}",
        f"Paid so far {format_money(paid, d.currency)}" + (f" · due {d.due_on:%Y-%m-%d}" if d.due_on else ""),
    ]
    if d.notes:
        lines.append(f"Note: {d.notes}")
    return RenderedDocument("debt", d.id, "\n".join(lines), d.due_on or d.started_on, amount_minor=d.amount_minor,
                            metadata={"counterparty": d.counterparty})


async def render_note(db: AsyncSession, user_id: uuid.UUID, note_id: uuid.UUID) -> RenderedDocument | None:
    n = (await db.execute(select(FinancialNote).where(FinancialNote.id == note_id, FinancialNote.user_id == user_id))).scalar_one_or_none()
    if n is None:
        return None
    return RenderedDocument("financial_note", n.id, f"[financial note] {n.created_at:%Y-%m-%d}\n{n.content}",
                            n.created_at.date())


async def render_insight(db: AsyncSession, user_id: uuid.UUID, insight_id: uuid.UUID) -> RenderedDocument | None:
    i = (await db.execute(select(AIInsight).where(AIInsight.id == insight_id, AIInsight.user_id == user_id))).scalar_one_or_none()
    if i is None or i.type == "pulse":
        return None
    return RenderedDocument("insight", i.id, f"[insight {i.created_at:%Y-%m-%d}] {i.title}\n{i.body}", i.created_at.date(),
                            provenance="system", metadata={"type": i.type, "period": i.period_key})


async def render(db: AsyncSession, user_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID, currency: str,
                 month: str | None = None) -> list[RenderedDocument]:
    if entity_type == "transaction":
        return await render_transaction(db, user_id, entity_id)
    if entity_type == "monthly_summary" and month:
        doc = await render_monthly_summary(db, user_id, parse_month(month), currency)
        return [doc] if doc else []
    renderer = {
        "budget": lambda: render_budget(db, user_id, entity_id, currency),
        "goal": lambda: render_goal(db, user_id, entity_id),
        "recurring_payment": lambda: render_recurring(db, user_id, entity_id),
        "debt": lambda: render_debt(db, user_id, entity_id),
        "financial_note": lambda: render_note(db, user_id, entity_id),
        "insight": lambda: render_insight(db, user_id, entity_id),
    }.get(entity_type)
    if renderer is None:
        return []
    doc = await renderer()
    return [doc] if doc else []
