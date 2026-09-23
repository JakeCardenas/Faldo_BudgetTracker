import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.money import pct_text, percent, percent_change
from app.engine.periods import Period, add_months, month_end, month_key, month_start
from app.services.analytics import (
    category_meta,
    category_rows,
    compare_spending,
    daily_totals,
    monthly_series,
    spending_by_category,
    spending_by_merchant,
    top_items,
    totals_by_type,
)


async def monthly_report(db: AsyncSession, user_id: uuid.UUID, month: date, today: date) -> dict[str, Any]:
    start = month_start(month)
    end = min(month_end(start), today)
    prev_start = add_months(start, -1)
    is_partial = end < month_end(start)
    prev_end = min(prev_start + timedelta(days=(end - start).days), month_end(prev_start)) if is_partial else month_end(prev_start)

    totals = await totals_by_type(db, user_id, start, end)
    prev = await totals_by_type(db, user_id, prev_start, prev_end)
    meta = await category_meta(db, user_id)
    by_cat = await spending_by_category(db, user_id, start, end)
    income_by_cat = await spending_by_category(db, user_id, start, end, kind="income")  # type: ignore[arg-type]
    comparison = await compare_spending(
        db, user_id, Period("month", start, end), Period("previous", prev_start, prev_end)
    )
    daily = await daily_totals(db, user_id, start, end)
    net = totals["income"] - totals["expense"]
    prev_net = prev["income"] - prev["expense"]
    days = (end - start).days + 1

    return {
        "month": month_key(start),
        "label": start.strftime("%B %Y"),
        "is_partial": is_partial,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "comparison_period": {"start": prev_start.isoformat(), "end": prev_end.isoformat()},
        "summary": {
            "income_minor": totals["income"],
            "expense_minor": totals["expense"],
            "net_minor": net,
            "savings_rate": percent(net, totals["income"]) if totals["income"] else None,
            "previous_income_minor": prev["income"],
            "previous_expense_minor": prev["expense"],
            "previous_net_minor": prev_net,
            "previous_savings_rate": percent(prev_net, prev["income"]) if prev["income"] else None,
            "income_change_pct": percent_change(totals["income"], prev["income"]),
            "expense_change_pct": percent_change(totals["expense"], prev["expense"]),
            "transaction_count": totals["count"],
            "average_daily_spend_minor": round(totals["expense"] / days) if days else 0,
        },
        "spending_by_category": category_rows(by_cat, meta),
        "income_by_category": category_rows(income_by_cat, meta),
        "category_changes": comparison["drivers"][:8],
        "top_merchants": await spending_by_merchant(db, user_id, start, end, 8),
        "top_items": await top_items(db, user_id, start, end, 8),
        "daily_spending": [
            {"date": (start + timedelta(days=i)).isoformat(), "amount_minor": daily.get(start + timedelta(days=i), 0)}
            for i in range(days)
        ],
        "history": await monthly_series(db, user_id, end, 12),
    }


def draft_report_summary(report: dict[str, Any], currency: str) -> str:
    from app.engine.money import format_money

    s = report["summary"]
    m = lambda v: format_money(v, currency)  # noqa: E731
    if not s["transaction_count"]:
        return f"No transactions were recorded in {report['label']}."
    parts = [f"In {report['label']}{' so far' if report['is_partial'] else ''}, you earned {m(s['income_minor'])} and spent "
             f"{m(s['expense_minor'])}, leaving {m(s['net_minor'])}."]
    if s["savings_rate"] is not None:
        parts.append(f"That's a savings rate of {pct_text(s['savings_rate'])}%.")
    if report["spending_by_category"]:
        top = report["spending_by_category"][0]
        parts.append(f"{top['label']} was your largest category at {m(top['amount_minor'])} ({pct_text(top['pct'])}% of spending).")
    changes = [c for c in report["category_changes"] if c["delta_minor"] > 0]
    if changes:
        c = changes[0]
        parts.append(f"{c['label']} rose the most, from {m(c['previous_minor'])} to {m(c['current_minor'])}.")
    if s["expense_change_pct"] is not None:
        direction = "more" if s["expense_change_pct"] > 0 else "less"
        parts.append(f"Overall you spent {pct_text(abs(s['expense_change_pct']))}% {direction} than the comparison period.")
    if report["top_merchants"]:
        tm = report["top_merchants"][0]
        parts.append(f"Your top merchant was {tm['name']} ({m(tm['amount_minor'])}).")
    return " ".join(parts)


async def report_summary(db: AsyncSession, user_id: uuid.UUID, month: date, today: date, currency: str) -> dict[str, Any]:
    from app.ai.factory import get_llm
    from app.ai.guardrails.numeric import check_numbers
    from app.ai.guardrails.output import sanitize_markdown

    report = await monthly_report(db, user_id, month, today)
    draft = draft_report_summary(report, currency)
    provider = get_llm()
    text, generated_by = draft, "template"
    if report["summary"]["transaction_count"]:
        facts = {"summary": report["summary"], "top_categories": report["spending_by_category"][:5],
                 "category_changes": report["category_changes"][:5], "top_merchants": report["top_merchants"][:3]}
        rewritten = await provider.write_summary("report", facts, draft)
        if rewritten:
            rewritten = sanitize_markdown(rewritten)
            if check_numbers(rewritten, [facts, draft], "").ok:
                text, generated_by = rewritten, provider.name
    return {"month": report["month"], "text": text, "generated_by": generated_by}
