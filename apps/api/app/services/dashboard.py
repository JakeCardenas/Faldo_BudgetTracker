import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.money import percent, percent_change
from app.engine.periods import previous_comparable, resolve_period
from app.models.identity import UserSettings
from app.services.accounts import account_balances
from app.services.accounts import to_out as account_out
from app.services.analytics import category_meta, category_rows, spending_by_category, totals_by_type
from app.services.budgets import budget_status
from app.services.debts import list_debts
from app.services.forecast import safe_to_spend
from app.services.goals import list_goals
from app.services.recurring import upcoming
from app.services.transactions import TransactionFilters, list_transactions

RANGES = {"this_month", "last_month", "last_30_days", "last_90_days", "this_year"}
ATTENTION_LIMIT = 5


def attention_items(
    today: date, sts: dict[str, Any], upcoming_items: list[dict[str, Any]], budget_lines: list[Any], debts: list[Any],
) -> list[dict[str, Any]]:
    """The few things worth acting on now. Facts only; the UI words them."""
    items: list[dict[str, Any]] = []
    if sts["raw_minor"] < 0:
        items.append({"kind": "short", "severity": "critical", "amount_minor": sts["shortfall_minor"], "date": sts["until"]})
    for u in upcoming_items:
        if u["is_overdue"]:
            items.append({"kind": "income_unconfirmed" if u["is_income"] else "bill_overdue",
                          "severity": "info" if u["is_income"] else "warning", "title": u["name"],
                          "amount_minor": u["amount_minor"], "date": u["due_on"], "ref_id": u["recurring_payment_id"],
                          "account_id": u["account_id"]})
    for d in debts:
        if d.status.value != "open" or not d.due_on or d.outstanding_minor <= 0:
            continue
        if d.due_on < today or (d.direction.value == "i_owe" and d.due_on <= today + timedelta(days=3)):
            items.append({"kind": "owe_due" if d.direction.value == "i_owe" else "owed_overdue",
                          "severity": "warning" if d.direction.value == "i_owe" else "info", "title": d.counterparty,
                          "amount_minor": d.outstanding_minor, "date": d.due_on.isoformat(), "ref_id": str(d.id),
                          "is_overdue": d.due_on < today})
    for line in sorted(budget_lines, key=lambda ln: -ln.pct_used):
        if line.status in {"over", "at_risk"}:
            items.append({"kind": "budget_" + line.status, "severity": "warning" if line.status == "over" else "info",
                          "title": line.category_name, "amount_minor": abs(line.remaining_minor),
                          "pct_used": line.pct_used, "ref_id": str(line.category_id)})
    order = {"critical": 0, "warning": 1, "info": 2}
    return sorted(items, key=lambda i: order[i["severity"]])[:ATTENTION_LIMIT]


async def dashboard(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, range_name: str) -> dict[str, Any]:
    period = resolve_period(range_name if range_name in RANGES else "this_month", today)
    previous = previous_comparable(period)
    totals = await totals_by_type(db, user_id, period.start, period.end)
    prev_totals = await totals_by_type(db, user_id, previous.start, previous.end)

    balances = await account_balances(db, user_id, include_archived=False)
    total_balance = sum(b.balance_minor for b in balances)
    prev_balance = sum(b.balance_minor for b in await account_balances(db, user_id, previous.end, include_archived=False))

    meta = await category_meta(db, user_id)
    by_cat = await spending_by_category(db, user_id, period.start, period.end)
    saved = totals["income"] - totals["expense"]
    prev_saved = prev_totals["income"] - prev_totals["expense"]

    budget = await budget_status(db, user_id, today, today)
    goals = [g for g in await list_goals(db, user_id, today) if g.status.value == "active"]
    recent = await list_transactions(db, user_id, TransactionFilters(), limit=6)
    upcoming_items = await upcoming(db, user_id, today, today + timedelta(days=21))
    sts = await safe_to_spend(db, user_id, settings, today)
    owed = await list_debts(db, user_id, today)

    return {
        "period": period.as_dict(),
        "previous_period": previous.as_dict(),
        "overview": {
            "total_balance_minor": total_balance,
            "total_balance_change_minor": total_balance - prev_balance,
            "income_minor": totals["income"],
            "income_change_pct": percent_change(totals["income"], prev_totals["income"]),
            "expense_minor": totals["expense"],
            "expense_change_pct": percent_change(totals["expense"], prev_totals["expense"]),
            "saved_minor": saved,
            "saved_change_minor": saved - prev_saved,
            "savings_rate": percent(saved, totals["income"]) if totals["income"] else None,
            "transaction_count": totals["count"],
        },
        "spending_by_category": category_rows(by_cat, meta),
        "budget": budget.model_dump(mode="json"),
        "recent_transactions": [t.model_dump(mode="json") for t in recent.items],
        "goals": [g.model_dump(mode="json", exclude={"contributions"}) for g in goals[:4]],
        "upcoming": upcoming_items[:8],
        "accounts": [account_out(b).model_dump(mode="json") for b in balances],
        "safe_to_spend": sts,
        "attention": attention_items(today, sts, upcoming_items, budget.lines, owed),
        "money_owed": {
            "you_owe_minor": sum(d.outstanding_minor for d in owed if d.status.value == "open" and d.direction.value == "i_owe"),
            "owed_to_you_minor": sum(d.outstanding_minor for d in owed if d.status.value == "open" and d.direction.value == "owed_to_me"),
        },
        "has_data": totals["count"] > 0 or bool(recent.items),
    }
