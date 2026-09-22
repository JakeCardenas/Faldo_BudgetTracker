"""A compact picture of the user's money, handed to the model before every answer.

With it, Faldo can answer "how am I doing?", "can I spend this weekend?" or "what's due?" straight away and
bring up what matters without first calling tools, which makes answers faster and more personal. Every
amount is formatted exactly as the tools format it, and the snapshot counts as a tool result for the
numeric guardrail, so figures quoted from it pass validation.
"""

import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.money import format_money
from app.engine.periods import resolve_period
from app.models.identity import UserSettings
from app.services.accounts import account_balances
from app.services.analytics import totals_by_type
from app.services.budgets import budget_status
from app.services.forecast import safe_to_spend
from app.services.goals import list_goals
from app.services.recurring import upcoming


async def money_snapshot(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> dict[str, Any]:
    fmt = lambda minor: format_money(minor, settings.currency)  # noqa: E731
    balances = await account_balances(db, user_id, include_archived=False)
    month = resolve_period("this_month", today)
    totals = await totals_by_type(db, user_id, month.start, month.end)
    sts = await safe_to_spend(db, user_id, settings, today)
    budget = await budget_status(db, user_id, today, today)
    due = await upcoming(db, user_id, today, today + timedelta(days=7))
    goals = [g for g in await list_goals(db, user_id, today) if g.status.value == "active"]
    return {
        "as_of": today.isoformat(),
        "total_balance": fmt(sum(b.balance_minor for b in balances)),
        "accounts": [{"name": b.account.name, "type": b.account.type.value, "balance": fmt(b.balance_minor)} for b in balances],
        "safe_to_spend": {
            "amount": fmt(sts["amount_minor"]), "per_day": fmt(sts["per_day_minor"]), "until": sts["until"],
            "status": sts["status"], "left_this_week": fmt(sts["week"]["left_minor"]),
            **({"short_by": fmt(sts["shortfall_minor"])} if sts["shortfall_minor"] else {}),
        },
        "this_month_so_far": {"income": fmt(totals["income"]), "spending": fmt(totals["expense"])},
        "budgets": [{"category": line.category_name, "spent": fmt(line.spent_minor), "limit": fmt(line.limit_minor),
                     "pct_used": line.pct_used, "status": line.status} for line in budget.lines[:8]],
        "due_in_the_next_7_days": [{"name": i["name"], "amount": fmt(i["amount_minor"]), "due_on": i["due_on"],
                                    "overdue": i["is_overdue"], "income": i["is_income"]} for i in due[:8]],
        "goals": [{"name": g.name, "saved": fmt(g.saved_minor), "target": fmt(g.target_minor), "pct_complete": g.pct_complete}
                  for g in goals[:5]],
    }
