import uuid
from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.health import HealthInputs, financial_health
from app.engine.periods import add_months, month_end, month_start
from app.engine.planning import monthly_equivalent
from app.models.enums import RecurringKind
from app.services.accounts import spendable_balance
from app.services.analytics import category_meta, history_days, spending_by_category, totals_by_type
from app.services.budgets import get_budget_model
from app.services.goals import list_goals
from app.services.recurring import list_recurring


async def health_score(db: AsyncSession, user_id: uuid.UUID, today: date) -> dict[str, Any]:
    meta = await category_meta(db, user_id)
    essential = {cid for cid, c in meta.items() if c.is_essential}
    this_month = month_start(today)
    incomes, expenses, discretionary, essentials = [], [], [], []
    budgeted, within = 0, 0
    for i in range(1, 7):
        start = add_months(this_month, -i)
        end = month_end(start)
        by_cat = await spending_by_category(db, user_id, start, end)
        disc = sum(v for k, v in by_cat.items() if k not in essential)
        discretionary.append(disc)
        if i <= 3:
            totals = await totals_by_type(db, user_id, start, end)
            incomes.append(totals["income"])
            expenses.append(totals["expense"])
            essentials.append(sum(v for k, v in by_cat.items() if k in essential))
            budget = await get_budget_model(db, user_id, start)
            if budget:
                for line in budget.lines:
                    budgeted += line.limit_minor
                    within += min(by_cat.get(line.category_id, 0), line.limit_minor)

    recurring = await list_recurring(db, user_id, today, active_only=True)
    obligations = sum(
        monthly_equivalent(r.amount_minor, r.frequency.value, r.interval_count)
        for r in recurring if r.kind != RecurringKind.income
    )
    goals = await list_goals(db, user_id, today)
    ratios = [g.average_monthly_minor / g.required_monthly_minor for g in goals
              if g.status.value == "active" and g.required_monthly_minor]
    months_with_essentials = [e for e in essentials if e > 0]
    inputs = HealthInputs(
        history_days=await history_days(db, user_id, today),
        monthly_income_minor=incomes,
        monthly_expense_minor=expenses,
        monthly_discretionary_minor=discretionary,
        budgeted_limit_minor=budgeted,
        budgeted_within_minor=within,
        spendable_balance_minor=await spendable_balance(db, user_id),
        avg_monthly_essential_minor=round(sum(months_with_essentials) / len(months_with_essentials)) if months_with_essentials else 0,
        recurring_monthly_obligations_minor=obligations,
        goal_actual_vs_required=ratios,
    )
    return financial_health(inputs)
