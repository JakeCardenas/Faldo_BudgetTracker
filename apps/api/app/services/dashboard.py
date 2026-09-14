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
from app.services.forecast import safe_to_spend
from app.services.goals import list_goals
from app.services.recurring import upcoming
from app.services.transactions import TransactionFilters, list_transactions

RANGES = {"this_month", "last_month", "last_30_days", "last_90_days", "this_year"}


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
        "safe_to_spend": await safe_to_spend(db, user_id, settings, today),
        "has_data": totals["count"] > 0 or bool(recent.items),
    }
