import hashlib
import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.factory import get_llm
from app.ai.guardrails.numeric import check_numbers
from app.ai.guardrails.output import sanitize_markdown
from app.engine.money import format_money, percent_change
from app.engine.periods import add_months, month_end, month_start
from app.models import AIInsight, BudgetCategory, GoalContribution, SavingsGoal, Transaction
from app.models.enums import InsightSeverity, InsightStatus
from app.models.identity import UserSettings
from app.services.analytics import totals_by_type
from app.services.budgets import budget_status
from app.services.goals import list_goals
from app.services.recurring import upcoming


async def data_version(db: AsyncSession, user_id: uuid.UUID, today: date) -> str:
    parts = []
    for model in (Transaction, BudgetCategory, SavingsGoal, GoalContribution):
        row = (await db.execute(select(func.count(model.id), func.max(model.updated_at)).where(model.user_id == user_id))).one()
        parts.append(f"{row[0]}:{row[1]}")
    parts.append(today.isoformat())
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:24]


async def pulse_facts(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> dict[str, Any]:
    cur = settings.currency
    start = month_start(today)
    totals = await totals_by_type(db, user_id, start, today)
    prev_start = add_months(start, -1)
    prev_end = min(prev_start + timedelta(days=(today - start).days), month_end(prev_start))
    prev = await totals_by_type(db, user_id, prev_start, prev_end)
    budget = await budget_status(db, user_id, today, today)
    goals = [g for g in await list_goals(db, user_id, today) if g.status.value == "active"]
    bills = [b for b in await upcoming(db, user_id, today, today + timedelta(days=7), include_income=False)]
    worst = sorted([line for line in budget.lines if line.status in {"over", "at_risk"}],
                   key=lambda line: (line.status != "over", -line.pct_used))
    return {
        "spent_this_month": format_money(totals["expense"], cur),
        "spent_minor": totals["expense"],
        "spent_same_period_last_month": format_money(prev["expense"], cur),
        "spending_change_pct": percent_change(totals["expense"], prev["expense"]) if prev["expense"] else None,
        "income_this_month": format_money(totals["income"], cur),
        "has_budgets": bool(budget.lines),
        "budget_issue": {"category": worst[0].category_name, "status": worst[0].status, "pct_used": worst[0].pct_used} if worst else None,
        "goals_on_track": [g.name for g in goals if g.on_track],
        "goals_behind": [g.name for g in goals if g.on_track is False],
        "next_bill": {"name": bills[0]["name"], "amount": format_money(bills[0]["amount_minor"], cur),
                      "due_on": bills[0]["due_on"]} if bills else None,
        "transaction_count": totals["count"],
    }


def draft_pulse(facts: dict[str, Any], today: date) -> str:
    if not facts["transaction_count"]:
        return "No transactions yet this month. Add one to see your financial pulse."
    sentences = []
    change = facts["spending_change_pct"]
    if change is not None and abs(change) >= 1:
        direction = "lower" if change < 0 else "higher"
        sentences.append(f"Your spending is {abs(change):g}% {direction} than at this point last month")
    else:
        sentences.append(f"You've spent {facts['spent_this_month']} so far this month")
    if facts["goals_behind"]:
        sentences[-1] += f", and {facts['goals_behind'][0]} is behind schedule."
    elif facts["goals_on_track"]:
        sentences[-1] += ", and you're on pace for your savings goals." if len(facts["goals_on_track"]) > 1 else \
            f", and you're on pace for {facts['goals_on_track'][0]}."
    else:
        sentences[-1] += "."
    issue = facts["budget_issue"]
    if issue:
        sentences.append(f"{issue['category']} is over budget." if issue["status"] == "over"
                         else f"{issue['category']} is at {issue['pct_used']:g}% of its budget and may go over.")
    elif facts["has_budgets"]:
        sentences.append("All budgets are on track.")
    bill = facts["next_bill"]
    if bill and len(sentences) < 3:
        due = date.fromisoformat(bill["due_on"])
        if due < today:
            sentences.append(f"{bill['name']} ({bill['amount']}) was due on {due:%b %-d}.")
        else:
            when = "today" if due == today else ("tomorrow" if due == today + timedelta(days=1) else f"on {due:%b %-d}")
            sentences.append(f"{bill['name']} ({bill['amount']}) is due {when}.")
    return " ".join(sentences)


async def get_pulse(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> dict[str, Any]:
    version = await data_version(db, user_id, today)
    key = f"pulse:{version}"
    cached = (await db.execute(select(AIInsight).where(AIInsight.user_id == user_id, AIInsight.dedupe_key == key))).scalar_one_or_none()
    if cached:
        return {"text": cached.body, "facts": cached.facts, "generated_by": cached.facts.get("_generated_by", "template"),
                "cached": True}
    facts = await pulse_facts(db, user_id, settings, today)
    draft = draft_pulse(facts, today)
    provider = get_llm()
    text, generated_by = draft, "template"
    if facts["transaction_count"]:
        rewritten = await provider.write_summary("pulse", facts, draft)
        if rewritten:
            rewritten = sanitize_markdown(rewritten)
            if check_numbers(rewritten, [facts, draft], "").ok and len(rewritten) <= 320:
                text, generated_by = rewritten, provider.name
    await db.execute(delete(AIInsight).where(AIInsight.user_id == user_id, AIInsight.type == "pulse"))
    db.add(AIInsight(user_id=user_id, type="pulse", severity=InsightSeverity.info, title="Financial pulse", body=text,
                     facts={**facts, "_generated_by": generated_by}, evidence=[], dedupe_key=key,
                     period_key=today.isoformat(), status=InsightStatus.active))
    await db.flush()
    return {"text": text, "facts": facts, "generated_by": generated_by, "cached": False}
