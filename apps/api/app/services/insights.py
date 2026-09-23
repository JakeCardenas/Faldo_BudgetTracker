import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.analysis import robust_z
from app.engine.money import format_money, pct_text, percent, percent_change
from app.engine.periods import add_months, month_end, month_key, month_start, resolve_period
from app.models import AIInsight, Merchant, Transaction
from app.models.enums import InsightSeverity, InsightStatus, TransactionType
from app.models.identity import UserSettings
from app.services.analytics import category_meta, spending_by_category, totals_by_type
from app.services.budgets import budget_status
from app.services.forecast import forecast
from app.services.goals import list_goals
from app.services.recurring import upcoming

# AI-written texts kept for reuse (the Home pulse, report summaries); not insight cards.
NOT_CARDS = ("pulse", "report_summary")
MIN_SPIKE_MINOR = 50_000
MIN_UNUSUAL_MINOR = 100_000


def _insight(type_: str, severity: InsightSeverity, title: str, body: str, key: str, period: str,
             facts: dict[str, Any], evidence: list[str] | None = None) -> dict[str, Any]:
    return {"type": type_, "severity": severity, "title": title, "body": body, "dedupe_key": f"{type_}:{key}",
            "period_key": period, "facts": facts, "evidence": evidence or []}


async def detect(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> list[dict[str, Any]]:
    cur = settings.currency
    m = lambda v: format_money(v, cur)  # noqa: E731
    period = month_key(today)
    found: list[dict[str, Any]] = []
    meta = await category_meta(db, user_id)

    budget = await budget_status(db, user_id, today, today)
    for line in budget.lines:
        facts = {"category": line.category_name, "spent_minor": line.spent_minor, "limit_minor": line.limit_minor,
                 "pct_used": line.pct_used, "projected_minor": line.projected_minor,
                 "pct_month_elapsed": line.pct_month_elapsed}
        if line.status == "over":
            found.append(_insight(
                "budget_exceeded", InsightSeverity.critical, f"{line.category_name} is over budget",
                f"You've spent {m(line.spent_minor)} of your {m(line.limit_minor)} {line.category_name} budget, "
                f"{m(line.spent_minor - line.limit_minor)} over.",
                f"{period}:{line.category_id}", period, facts))
        elif line.status == "at_risk":
            found.append(_insight(
                "budget_risk", InsightSeverity.warning, f"{line.category_name} may go over budget",
                f"{pct_text(line.pct_used)}% used with {pct_text(line.pct_month_elapsed)}% of the month gone. At this pace you'd spend "
                f"about {m(line.projected_minor)} against a {m(line.limit_minor)} budget.",
                f"{period}:{line.category_id}", period, facts))
        elif line.status == "near_limit":
            found.append(_insight(
                "budget_risk", InsightSeverity.info, f"{line.category_name} is near its limit",
                f"{m(line.remaining_minor)} left of your {m(line.limit_minor)} {line.category_name} budget.",
                f"{period}:{line.category_id}", period, facts))

    mtd = resolve_period("this_month", today)
    current = await spending_by_category(db, user_id, mtd.start, mtd.end)
    prior_months: list[dict[uuid.UUID | None, int]] = []
    for i in range(1, 4):
        start = add_months(mtd.start, -i)
        end = min(start + timedelta(days=(mtd.end - mtd.start).days), month_end(start))
        prior_months.append(await spending_by_category(db, user_id, start, end))
    for cid, amount in current.items():
        history = [pm.get(cid, 0) for pm in prior_months]
        if cid is None or sum(1 for h in history if h > 0) < 2:
            continue
        avg = round(sum(history) / 3)
        change = percent_change(amount, avg)
        if avg > 0 and amount - avg >= MIN_SPIKE_MINOR and change is not None and change >= 30:
            name = meta[cid].name if cid in meta else "Uncategorized"
            found.append(_insight(
                "spending_increase", InsightSeverity.warning, f"{name} spending is up {pct_text(change)}%",
                f"{m(amount)} so far this month, compared with a {m(avg)} average for the same days over the last "
                "three months.",
                f"{period}:{cid}", period,
                {"category": name, "current_minor": amount, "average_minor": avg, "change_pct": change}))

    this_total = await totals_by_type(db, user_id, mtd.start, mtd.end)
    prev_start = add_months(mtd.start, -1)
    prev_end = min(prev_start + timedelta(days=(mtd.end - mtd.start).days), month_end(prev_start))
    prev_total = await totals_by_type(db, user_id, prev_start, prev_end)
    change = percent_change(this_total["expense"], prev_total["expense"])
    if change is not None and prev_total["expense"] > 0 and today.day >= 5:
        facts = {"current_minor": this_total["expense"], "previous_minor": prev_total["expense"], "change_pct": change}
        if change <= -10:
            found.append(_insight(
                "spending_decrease", InsightSeverity.positive, f"Spending is down {pct_text(abs(change))}% from last month",
                f"{m(this_total['expense'])} spent so far versus {m(prev_total['expense'])} by this point last month.",
                period, period, facts))
        elif change >= 15:
            found.append(_insight(
                "spending_increase_total", InsightSeverity.warning, f"Spending is up {pct_text(change)}% from last month",
                f"{m(this_total['expense'])} spent so far versus {m(prev_total['expense'])} by this point last month.",
                period, period, facts))

    recent_start = today - timedelta(days=14)
    recent = (
        await db.execute(
            select(Transaction, Merchant.name)
            .outerjoin(Merchant, Merchant.id == Transaction.merchant_id)
            .where(Transaction.user_id == user_id, Transaction.type == TransactionType.expense,
                   Transaction.occurred_on >= recent_start, Transaction.amount_minor >= MIN_UNUSUAL_MINOR,
                   Transaction.recurring_payment_id.is_(None))
        )
    ).all()
    for txn, merchant_name in recent:
        history_rows = (
            await db.execute(
                select(Transaction.amount_minor).where(
                    Transaction.user_id == user_id, Transaction.type == TransactionType.expense,
                    Transaction.category_id == txn.category_id, Transaction.id != txn.id,
                    Transaction.occurred_on.between(today - timedelta(days=180), today),
                )
            )
        ).scalars().all()
        z = robust_z(txn.amount_minor, [float(v) for v in history_rows])
        if z is not None and z >= 3.5:
            name = meta[txn.category_id].name if txn.category_id in meta else "Uncategorized"
            label = merchant_name or name
            typical = sorted(history_rows)[len(history_rows) // 2]
            found.append(_insight(
                "unusual_transaction", InsightSeverity.info, f"Unusually large {name} purchase",
                f"{m(txn.amount_minor)} at {label} on {txn.occurred_on:%b %-d}. Your typical {name} purchase is "
                f"around {m(typical)}.",
                str(txn.id), period,
                {"amount_minor": txn.amount_minor, "typical_minor": typical, "category": name, "merchant": label,
                 "date": txn.occurred_on.isoformat()},
                [str(txn.id)]))

    for occ in await upcoming(db, user_id, today, today + timedelta(days=3), include_income=False):
        when = "overdue" if occ["is_overdue"] else ("due today" if occ["days_until_due"] == 0 else
                                                     f"due in {occ['days_until_due']} day{'s' if occ['days_until_due'] != 1 else ''}")
        found.append(_insight(
            "payment_reminder", InsightSeverity.warning if occ["is_overdue"] else InsightSeverity.info,
            f"{occ['name']} is {when}",
            f"{m(occ['amount_minor'])} {occ['kind']} scheduled for {date.fromisoformat(occ['due_on']):%b %-d}.",
            f"{occ['recurring_payment_id']}:{occ['due_on']}", period,
            {"name": occ["name"], "amount_minor": occ["amount_minor"], "due_on": occ["due_on"], "kind": occ["kind"]}))

    fc = await forecast(db, user_id, settings, today)
    if fc["sufficiency"] != "insufficient":
        end_p50 = fc["end_balance"]["p50"]
        lowest = fc["lowest_point"]["p50_minor"]
        facts = {"end_p50_minor": end_p50, "lowest_minor": lowest, "lowest_on": fc["lowest_point"]["date"],
                 "buffer_minor": settings.safe_to_spend_buffer_minor}
        if lowest < 0:
            found.append(_insight(
                "cash_flow_warning", InsightSeverity.critical, "Your balance may run short this month",
                f"Based on scheduled bills and your usual spending, your spendable balance could dip to "
                f"{m(lowest)} around {date.fromisoformat(fc['lowest_point']['date']):%b %-d}. This is an estimate.",
                period, period, facts))
        elif end_p50 < settings.safe_to_spend_buffer_minor:
            found.append(_insight(
                "cash_flow_warning", InsightSeverity.warning, "Month-end balance looks tight",
                f"Your spendable balance is projected to end the month near {m(end_p50)}, below your "
                f"{m(settings.safe_to_spend_buffer_minor)} safety buffer. This is an estimate.",
                period, period, facts))

    for goal in await list_goals(db, user_id, today):
        if goal.status.value != "active":
            continue
        facts = {"goal": goal.name, "saved_minor": goal.saved_minor, "target_minor": goal.target_minor,
                 "pct_complete": goal.pct_complete,
                 "projected_completion_on": goal.projected_completion_on.isoformat() if goal.projected_completion_on else None,
                 "target_date": goal.target_date.isoformat() if goal.target_date else None,
                 "required_monthly_minor": goal.required_monthly_minor}
        if goal.on_track is False and goal.target_date:
            projected = goal.projected_completion_on
            # Late within the same month reads as a contradiction by month ("Oct 2026, but around Oct 2026"): give days.
            when = "%b %-d, %Y" if projected and (projected.year, projected.month) == (goal.target_date.year, goal.target_date.month) else "%b %Y"
            detail = f"at your current pace you'd reach it around {projected:{when}}" if projected else "there are no recent contributions"
            need = f" You'd need about {m(goal.required_monthly_minor)} a month." if goal.required_monthly_minor else ""
            found.append(_insight(
                "goal_behind", InsightSeverity.warning, f"{goal.name} is behind schedule",
                f"Your target is {goal.target_date:{when}}, but {detail}.{need}",
                f"{period}:{goal.id}", period, facts))
        elif goal.on_track:
            milestone = max((p for p in (25, 50, 75) if goal.pct_complete >= p), default=None)
            if milestone:
                found.append(_insight(
                    "goal_progress", InsightSeverity.positive, f"{goal.name} is {pct_text(goal.pct_complete)}% funded",
                    f"{m(goal.saved_minor)} saved of {m(goal.target_minor)}, on pace for your target date.",
                    f"{goal.id}:{milestone}", period, facts))

    last_month = add_months(month_start(today), -1)
    lm_totals = await totals_by_type(db, user_id, last_month, month_end(last_month))
    if lm_totals["income"] > 0:
        rate = percent(lm_totals["income"] - lm_totals["expense"], lm_totals["income"])
        if rate is not None and rate >= 20:
            found.append(_insight(
                "savings_rate", InsightSeverity.positive, f"You kept {pct_text(rate)}% of your income in {last_month:%B}",
                f"{m(lm_totals['income'])} earned and {m(lm_totals['expense'])} spent.",
                month_key(last_month), period,
                {"income_minor": lm_totals["income"], "expense_minor": lm_totals["expense"], "savings_rate": rate}))
    return found


async def refresh_insights(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> None:
    detected = await detect(db, user_id, settings, today)
    existing = {
        i.dedupe_key: i
        for i in (await db.execute(select(AIInsight).where(AIInsight.user_id == user_id, AIInsight.type.not_in(NOT_CARDS)))).scalars().all()
    }
    now = datetime.now(UTC)
    keys = set()
    for item in detected:
        keys.add(item["dedupe_key"])
        row = existing.get(item["dedupe_key"])
        if row is None:
            db.add(AIInsight(user_id=user_id, status=InsightStatus.active, last_seen_at=now, **item))
        else:
            row.title, row.body, row.facts, row.severity = item["title"], item["body"], item["facts"], item["severity"]
            row.evidence, row.last_seen_at = item["evidence"], now
    stale = [k for k, row in existing.items() if k not in keys and row.status == InsightStatus.active]
    if stale:
        await db.execute(delete(AIInsight).where(AIInsight.user_id == user_id, AIInsight.dedupe_key.in_(stale)))
    await db.flush()


SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2, "positive": 3}


async def list_insights(db: AsyncSession, user_id: uuid.UUID, include_dismissed: bool = False) -> list[AIInsight]:
    stmt = select(AIInsight).where(AIInsight.user_id == user_id, AIInsight.type.not_in(NOT_CARDS))
    if not include_dismissed:
        stmt = stmt.where(AIInsight.status == InsightStatus.active)
    rows = list((await db.execute(stmt)).scalars().all())
    rows.sort(key=lambda i: (SEVERITY_ORDER[i.severity.value], -i.created_at.timestamp()))
    return rows
