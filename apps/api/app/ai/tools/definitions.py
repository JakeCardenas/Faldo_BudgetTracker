import math
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.ai.rag.retriever import search_memory
from app.ai.tools.registry import ToolContext, ToolOutput, tool
from app.engine.calculator import evaluate
from app.engine.check import affordable_on
from app.engine.money import format_money, minor_factor, percent, percent_change, to_minor
from app.engine.periods import (
    Period,
    add_months,
    month_end,
    month_start,
    parse_month,
    previous_comparable,
    resolve_period,
)
from app.engine.scenarios import Adjustment
from app.models import Category, Transaction, TransactionItem
from app.models.enums import TransactionType
from app.services import analytics, budgets, debts, forecast, goals, health, insights, money_plan, recurring
from app.services import check as check_service
from app.services import planned as planned_service
from app.services.accounts import account_balances
from app.services.transactions import TransactionFilters, list_transactions

PeriodArg = Literal[
    "today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_30_days", "last_90_days",
    "last_3_months", "last_6_months", "this_year", "last_year", "all_time", "custom",
]
MEMORY_TYPES = Literal[
    "transaction", "transaction_item", "monthly_summary", "budget", "goal", "recurring_payment", "debt",
    "financial_note", "insight",
]


def _fmt(ctx: ToolContext, minor: int) -> str:
    return format_money(minor, ctx.currency)


def _period(ctx: ToolContext, name: str | None, start: str | None, end: str | None, default: str = "this_month") -> Period:
    return resolve_period(
        name or default, ctx.today,
        date.fromisoformat(start) if start else None,
        date.fromisoformat(end) if end else None,
    )


async def _find_category(ctx: ToolContext, name: str) -> Category | None:
    rows = (await ctx.db.execute(select(Category).where(Category.user_id == ctx.user_id))).scalars().all()
    target = name.strip().lower()
    exact = [c for c in rows if c.name.lower() == target]
    if exact:
        return sorted(exact, key=lambda c: c.parent_id is not None)[0]
    partial = [c for c in rows if target in c.name.lower() or c.name.lower().split(" ")[0] in target]
    return sorted(partial, key=lambda c: (c.parent_id is not None, len(c.name)))[0] if partial else None


async def _category_names(ctx: ToolContext) -> list[str]:
    rows = (await ctx.db.execute(select(Category.name).where(Category.user_id == ctx.user_id, Category.parent_id.is_(None)))).scalars()
    return sorted(rows)


def _txn_ref(ctx: ToolContext, t: Any) -> str:
    return ctx.add_ref("t", f"transaction:{t.id}", {
        "type": "transaction", "id": str(t.id), "label": t.merchant or t.category_name or t.type.value.title(),
        "date": t.occurred_on.isoformat(), "amount_minor": t.amount_minor, "category": t.category_name,
        "transaction_type": t.type.value,
    })


def _txn_rows(ctx: ToolContext, items: list[Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    llm_rows, block_rows = [], []
    for t in items:
        ref = _txn_ref(ctx, t)
        llm_rows.append({
            "ref": ref, "date": t.occurred_on.isoformat(), "type": t.type.value, "amount": _fmt(ctx, t.amount_minor),
            "amount_minor": t.amount_minor, "merchant": t.merchant, "category": t.category_name,
            "subcategory": t.subcategory_name, "account": t.account_name,
            "items": [i.name for i in t.items][:6], "notes": t.notes,
        })
        block_rows.append({
            "ref": ref, "id": str(t.id), "date": t.occurred_on.isoformat(), "type": t.type.value,
            "merchant": t.merchant, "category": t.category_name, "category_color": t.category_color,
            "account": t.account_name, "amount_minor": t.amount_minor,
        })
    return llm_rows, block_rows


class NoArgs(BaseModel):
    pass


@tool("get_current_balance", "Current balances for every account, total balance, spendable balance, safe-to-spend until "
      "the next income (only money already received counts) and what's left for this week. Use for any balance, "
      "'how much money do I have' or 'how much can I spend' question.", NoArgs,
      "Checking your account balances")
async def get_current_balance(ctx: ToolContext, _: NoArgs) -> ToolOutput:
    balances = await account_balances(ctx.db, ctx.user_id, include_archived=False)
    total = sum(b.balance_minor for b in balances)
    spendable = sum(b.balance_minor for b in balances if b.account.is_spendable)
    sts = await forecast.safe_to_spend(ctx.db, ctx.user_id, ctx.settings, ctx.today)
    accounts = [{"name": b.account.name, "type": b.account.type.value, "balance": _fmt(ctx, b.balance_minor),
                 "balance_minor": b.balance_minor, "spendable": b.account.is_spendable} for b in balances]
    return ToolOutput(
        {"as_of": ctx.today.isoformat(), "accounts": accounts, "total_balance": _fmt(ctx, total), "total_balance_minor": total,
         "spendable_balance": _fmt(ctx, spendable), "spendable_balance_minor": spendable,
         "safe_to_spend": _fmt(ctx, sts["amount_minor"]), "safe_to_spend_minor": sts["amount_minor"],
         "safe_to_spend_per_day": _fmt(ctx, sts["per_day_minor"]), "safe_to_spend_until": sts["until"],
         "safe_to_spend_period": "until next income" if sts["period"] == "until_income" else "next 30 days",
         "next_income": sts["next_income_label"], "next_income_date": sts["next_income_on"],
         "left_this_week": _fmt(ctx, sts["week"]["left_minor"]), "left_this_week_minor": sts["week"]["left_minor"],
         "safe_to_spend_breakdown": [{"label": line["label"], "operation": line["op"], "amount": _fmt(ctx, line["amount_minor"]),
                                      "amount_minor": line["amount_minor"]} for line in sts["lines"]],
         "note": "Total balance subtracts credit card balances owed. Spendable excludes savings and credit cards. "
                 "Safe to spend never counts income that hasn't arrived yet."},
        [
            {"type": "stats", "title": "Balances", "items": [
                {"label": "Total balance", "amount_minor": total},
                {"label": "Spendable", "amount_minor": spendable},
                {"label": "Safe to spend", "amount_minor": sts["amount_minor"], "hint": f"≈ {_fmt(ctx, sts['per_day_minor'])}/day"},
                {"label": "Left this week", "amount_minor": sts["week"]["left_minor"]},
            ]},
            {"type": "list", "title": "Accounts", "items": [
                {"label": b.account.name, "amount_minor": b.balance_minor, "hint": b.account.type.value.replace("_", " ")}
                for b in balances
            ]},
        ],
    )


class MonthArgs(BaseModel):
    month: str | None = Field(None, description="YYYY-MM, or 'last_month'. Null means the current month.")


async def _month_totals(ctx: ToolContext, month: str | None, kind: TransactionType) -> ToolOutput:
    if month == "last_month":
        start = add_months(month_start(ctx.today), -1)
    else:
        start = parse_month(month) if month else month_start(ctx.today)
    end = min(month_end(start), ctx.today)
    if start > ctx.today:
        return ToolOutput({"error": "That month is in the future."})
    prev_start = add_months(start, -1)
    prev_end = min(prev_start + timedelta(days=(end - start).days), month_end(prev_start))
    meta = await analytics.category_meta(ctx.db, ctx.user_id)
    by_cat = await analytics.spending_by_category(ctx.db, ctx.user_id, start, end, kind)
    prev = await analytics.spending_by_category(ctx.db, ctx.user_id, prev_start, prev_end, kind)
    total, prev_total = sum(by_cat.values()), sum(prev.values())
    rows = analytics.category_rows(by_cat, meta)
    label = "Income" if kind == TransactionType.income else "Expenses"
    result: dict[str, Any] = {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "is_partial_month": end < month_end(start),
                   "label": Period("month", start, end).label()},
        f"total_{kind.value}": _fmt(ctx, total), "total_minor": total,
        "comparison_period": {"start": prev_start.isoformat(), "end": prev_end.isoformat()},
        "comparison_total": _fmt(ctx, prev_total), "comparison_total_minor": prev_total,
        "change_pct": percent_change(total, prev_total),
        "by_category": [{"category": r["label"], "amount": _fmt(ctx, r["amount_minor"]), "amount_minor": r["amount_minor"],
                         "share_pct": r["pct"]} for r in rows],
    }
    blocks: list[dict[str, Any]] = [{"type": "stats", "title": f"{label} · {start:%B %Y}", "items": [
        {"label": label, "amount_minor": total},
        {"label": "Same period last month", "amount_minor": prev_total},
        {"label": "Change", "value": f"{result['change_pct']:+g}%" if result["change_pct"] is not None else "—"},
    ]}]
    if rows:
        blocks.append({"type": "breakdown", "title": f"{label} by category", "total_minor": total,
                       "rows": [{"label": r["label"], "amount_minor": r["amount_minor"], "pct": r["pct"], "color": r["color"]} for r in rows[:8]]})
    if kind == TransactionType.expense:
        merchants = await analytics.spending_by_merchant(ctx.db, ctx.user_id, start, end, 5)
        result["top_merchants"] = [{"merchant": m["name"], "amount": _fmt(ctx, m["amount_minor"]), "amount_minor": m["amount_minor"],
                                    "count": m["count"]} for m in merchants]
    return ToolOutput(result, blocks)


@tool("get_monthly_income", "Total income for a month with a breakdown by income category and a comparison with the same "
      "days of the previous month.", MonthArgs, "Adding up your income")
async def get_monthly_income(ctx: ToolContext, args: MonthArgs) -> ToolOutput:
    return await _month_totals(ctx, args.month, TransactionType.income)


@tool("get_monthly_expenses", "Total expenses for a month with category breakdown, top merchants, and a comparison with the "
      "same days of the previous month. Use for 'where did my money go' questions.", MonthArgs, "Adding up your spending")
async def get_monthly_expenses(ctx: ToolContext, args: MonthArgs) -> ToolOutput:
    return await _month_totals(ctx, args.month, TransactionType.expense)


class CategorySpendingArgs(BaseModel):
    period: PeriodArg = "this_month"
    category: str | None = Field(None, description="Category or subcategory name. Null for all categories.")
    start_date: str | None = Field(None, description="YYYY-MM-DD, only when period is custom")
    end_date: str | None = Field(None, description="YYYY-MM-DD, only when period is custom")


@tool("get_category_spending", "Exact spending per category for a period, or details for one category (subcategories, top "
      "merchants, recent transactions). Only works for real category names; for products or brands use "
      "search_financial_memory.", CategorySpendingArgs, "Breaking down spending by category")
async def get_category_spending(ctx: ToolContext, args: CategorySpendingArgs) -> ToolOutput:
    period = _period(ctx, args.period, args.start_date, args.end_date)
    meta = await analytics.category_meta(ctx.db, ctx.user_id)
    if not args.category:
        by_cat = await analytics.spending_by_category(ctx.db, ctx.user_id, period.start, period.end)
        rows = analytics.category_rows(by_cat, meta)
        total = sum(by_cat.values())
        return ToolOutput(
            {"period": period.as_dict(), "total_expenses": _fmt(ctx, total), "total_minor": total,
             "categories": [{"category": r["label"], "amount": _fmt(ctx, r["amount_minor"]), "amount_minor": r["amount_minor"],
                             "share_pct": r["pct"],
                             "essential": bool(r["category_id"] and meta[uuid.UUID(r["category_id"])].is_essential)}
                            for r in rows]},
            [{"type": "breakdown", "title": f"Spending by category · {period.label()}", "total_minor": total,
              "rows": [{"label": r["label"], "amount_minor": r["amount_minor"], "pct": r["pct"], "color": r["color"]} for r in rows[:10]]}],
        )
    category = await _find_category(ctx, args.category)
    if category is None:
        return ToolOutput({"error": f"No category named '{args.category}'.", "available_categories": await _category_names(ctx),
                           "hint": "For products, brands or free-text topics, use search_financial_memory."})
    listing = await list_transactions(ctx.db, ctx.user_id, TransactionFilters(
        category_ids=[category.id], types=[TransactionType.expense, TransactionType.income],
        date_from=period.start, date_to=period.end), limit=12)
    total = listing.total_expense_minor if category.kind.value == "expense" else listing.total_income_minor
    llm_rows, block_rows = _txn_rows(ctx, listing.items)
    result: dict[str, Any] = {
        "period": period.as_dict(), "category": category.name,
        "category_level": "subcategory" if category.parent_id else "category",
        "total": _fmt(ctx, total), "total_minor": total,
        "transaction_count": listing.total_count, "transactions_shown": llm_rows,
    }
    blocks: list[dict[str, Any]] = []
    if category.parent_id is None:
        subs = await analytics.spending_by_subcategory(ctx.db, ctx.user_id, period.start, period.end, category.id)
        result["by_subcategory"] = [{"subcategory": meta[k].name if k in meta else "Unspecified", "amount": _fmt(ctx, v),
                                     "amount_minor": v} for k, v in sorted(subs.items(), key=lambda kv: -kv[1])]
    blocks.append({"type": "transactions", "title": f"{category.name} · {period.label()}", "total_minor": total,
                   "count": listing.total_count, "items": block_rows})
    return ToolOutput(result, blocks)


class TransactionsArgs(BaseModel):
    period: PeriodArg = "this_month"
    start_date: str | None = None
    end_date: str | None = None
    type: Literal["expense", "income", "transfer"] | None = None
    category: str | None = None
    search: str | None = Field(None, description="Keyword matched against merchant, items, notes, tags")
    min_amount: float | None = Field(None, description="Major units, e.g. 1000 for ₱1,000")
    max_amount: float | None = None
    sort: Literal["date_desc", "amount_desc"] = "date_desc"
    limit: int = Field(15, ge=1, le=40)


@tool("get_transactions", "List the user's transactions with filters. Totals returned are exact sums over all matches, "
      "not just the rows shown.", TransactionsArgs, "Looking through your transactions")
async def get_transactions(ctx: ToolContext, args: TransactionsArgs) -> ToolOutput:
    period = _period(ctx, args.period, args.start_date, args.end_date)
    category_ids = None
    if args.category:
        cat = await _find_category(ctx, args.category)
        if cat is None:
            return ToolOutput({"error": f"No category named '{args.category}'.", "available_categories": await _category_names(ctx)})
        category_ids = [cat.id]
    filters = TransactionFilters(
        q=args.search, types=[TransactionType(args.type)] if args.type else None, category_ids=category_ids,
        date_from=period.start, date_to=period.end,
        min_amount_minor=to_minor(args.min_amount, ctx.currency) if args.min_amount is not None else None,
        max_amount_minor=to_minor(args.max_amount, ctx.currency) if args.max_amount is not None else None,
    )
    listing = await list_transactions(ctx.db, ctx.user_id, filters, sort=args.sort, limit=args.limit)
    llm_rows, block_rows = _txn_rows(ctx, listing.items)
    return ToolOutput(
        {"period": period.as_dict(), "match_count": listing.total_count, "shown": len(llm_rows),
         "total_expenses": _fmt(ctx, listing.total_expense_minor), "total_expenses_minor": listing.total_expense_minor,
         "total_income": _fmt(ctx, listing.total_income_minor), "total_income_minor": listing.total_income_minor,
         "transactions": llm_rows},
        [{"type": "transactions", "title": f"Transactions · {period.label()}", "count": listing.total_count,
          "total_minor": listing.total_expense_minor or listing.total_income_minor, "items": block_rows}],
    )


class CompareArgs(BaseModel):
    period: Literal["this_month", "last_month", "this_week", "last_week", "last_30_days", "last_90_days"] = "this_month"


@tool("compare_spending", "Compare spending in a period with the previous comparable period (e.g. this month so far vs the "
      "same days last month). Returns totals, change, and which categories drove the difference.", CompareArgs,
      "Comparing with the previous period")
async def compare_spending(ctx: ToolContext, args: CompareArgs) -> ToolOutput:
    current = resolve_period(args.period, ctx.today)
    previous = previous_comparable(current)
    data = await analytics.compare_spending(ctx.db, ctx.user_id, current, previous)
    drivers = [{"category": d["label"], "current": _fmt(ctx, d["current_minor"]), "previous": _fmt(ctx, d["previous_minor"]),
                "change": _fmt(ctx, d["delta_minor"]), "change_minor": d["delta_minor"], "change_pct": d["delta_pct"]}
               for d in data["drivers"][:6]]
    return ToolOutput(
        {"current_period": current.as_dict(), "previous_period": previous.as_dict(),
         "current_total": _fmt(ctx, data["current_total_minor"]), "current_total_minor": data["current_total_minor"],
         "previous_total": _fmt(ctx, data["previous_total_minor"]), "previous_total_minor": data["previous_total_minor"],
         "difference": _fmt(ctx, data["delta_minor"]), "difference_minor": data["delta_minor"], "change_pct": data["delta_pct"],
         "biggest_changes": drivers},
        [{"type": "comparison", "title": "Spending comparison", "current_label": current.label(), "previous_label": previous.label(),
          "current_minor": data["current_total_minor"], "previous_minor": data["previous_total_minor"],
          "delta_minor": data["delta_minor"], "delta_pct": data["delta_pct"],
          "drivers": [{"label": d["label"], "delta_minor": d["delta_minor"], "current_minor": d["current_minor"],
                       "previous_minor": d["previous_minor"]} for d in data["drivers"][:6]]}],
    )


class SavingsArgs(BaseModel):
    months: int = Field(6, ge=2, le=12)


@tool("get_savings_summary", "Month-by-month income, expenses, net saved (income minus expenses) and savings rate. Use for "
      "'how much am I saving' questions.", SavingsArgs, "Reviewing your monthly savings")
async def get_savings_summary(ctx: ToolContext, args: SavingsArgs) -> ToolOutput:
    series = await analytics.monthly_series(ctx.db, ctx.user_id, ctx.today, args.months)
    full = [m for m in series if not m["is_partial"] and (m["income_minor"] or m["expense_minor"])]
    avg_net = round(sum(m["net_minor"] for m in full) / len(full)) if full else 0
    avg_income = round(sum(m["income_minor"] for m in full) / len(full)) if full else 0
    return ToolOutput(
        {"months": [{"month": m["month"], "income": _fmt(ctx, m["income_minor"]), "income_minor": m["income_minor"],
                     "expenses": _fmt(ctx, m["expense_minor"]), "expenses_minor": m["expense_minor"],
                     "net_saved": _fmt(ctx, m["net_minor"]), "net_saved_minor": m["net_minor"],
                     "savings_rate_pct": m["savings_rate"], "partial_month": m["is_partial"]} for m in series],
         "average_net_saved_full_months": _fmt(ctx, avg_net), "average_net_saved_minor": avg_net,
         "average_savings_rate_pct": percent(avg_net, avg_income) if avg_income else None,
         "full_months_counted": len(full)},
        [{"type": "bars", "title": "Income vs expenses", "series": [
            {"label": m["label"], "income_minor": m["income_minor"], "expense_minor": m["expense_minor"], "partial": m["is_partial"]}
            for m in series]},
         {"type": "stats", "title": "Savings", "items": [
             {"label": "Average saved / month", "amount_minor": avg_net, "hint": f"{len(full)} full months"},
             {"label": "Average savings rate",
              "value": f"{percent(avg_net, avg_income):g}%" if avg_income else "—"},
         ]}],
    )


@tool("get_budget_status", "Budget limits, amount spent, remaining, percent used, projected month-end spend and status for "
      "each budgeted category, plus last month's spend.", MonthArgs, "Checking your budgets")
async def get_budget_status(ctx: ToolContext, args: MonthArgs) -> ToolOutput:
    month = add_months(month_start(ctx.today), -1) if args.month == "last_month" else (parse_month(args.month) if args.month else ctx.today)
    status = await budgets.budget_status(ctx.db, ctx.user_id, month, ctx.today)
    if not status.lines:
        return ToolOutput({"month": status.month, "has_budget": False, "total_spent_this_month": _fmt(ctx, status.total_spent_all_minor),
                           "total_spent_minor": status.total_spent_all_minor})
    lines = [{"category": line.category_name, "limit": _fmt(ctx, line.limit_minor), "limit_minor": line.limit_minor,
              "spent": _fmt(ctx, line.spent_minor), "spent_minor": line.spent_minor,
              "remaining": _fmt(ctx, line.remaining_minor), "remaining_minor": line.remaining_minor,
              "pct_used": line.pct_used, "pct_month_elapsed": line.pct_month_elapsed,
              "projected_month_end": _fmt(ctx, line.projected_minor), "projected_minor": line.projected_minor,
              "status": line.status, "last_month_spent": _fmt(ctx, line.previous_spent_minor),
              "last_month_spent_minor": line.previous_spent_minor} for line in status.lines]
    return ToolOutput(
        {"month": status.month, "has_budget": True, "total_budgeted": _fmt(ctx, status.total_budgeted_minor),
         "total_budgeted_minor": status.total_budgeted_minor, "total_spent_in_budgeted_categories": _fmt(ctx, status.total_spent_minor),
         "total_spent_minor": status.total_spent_minor, "unbudgeted_spending": _fmt(ctx, status.unbudgeted_spent_minor),
         "unbudgeted_spending_minor": status.unbudgeted_spent_minor, "lines": lines},
        [{"type": "progress", "title": f"Budgets · {status.month}", "items": [
            {"label": line.category_name, "current_minor": line.spent_minor, "target_minor": line.limit_minor, "pct": line.pct_used,
             "status": line.status, "hint": f"{_fmt(ctx, line.remaining_minor)} left" if line.remaining_minor >= 0 else f"{_fmt(ctx, -line.remaining_minor)} over"}
            for line in status.lines]}],
    )


class GoalArgs(BaseModel):
    goal_name: str | None = Field(None, description="Part of a goal name, or null for all goals")


@tool("get_goal_progress", "Savings goals with saved amount, target, percent, required monthly saving, average monthly "
      "contribution, and projected completion date. Use for 'when can I afford <goal>' questions.", GoalArgs,
      "Checking your savings goals")
async def get_goal_progress(ctx: ToolContext, args: GoalArgs) -> ToolOutput:
    all_goals = await goals.list_goals(ctx.db, ctx.user_id, ctx.today)
    selected = [g for g in all_goals if not args.goal_name or args.goal_name.lower() in g.name.lower()
                or g.name.lower() in args.goal_name.lower()]
    if args.goal_name and not selected:
        return ToolOutput({"error": f"No goal matching '{args.goal_name}'.", "goals": [g.name for g in all_goals]})
    rows = [{"goal": g.name, "status": g.status.value, "saved": _fmt(ctx, g.saved_minor), "saved_minor": g.saved_minor,
             "target": _fmt(ctx, g.target_minor), "target_minor": g.target_minor, "remaining": _fmt(ctx, g.remaining_minor),
             "remaining_minor": g.remaining_minor, "pct_complete": g.pct_complete,
             "target_date": g.target_date.isoformat() if g.target_date else None,
             "planned_monthly": _fmt(ctx, g.monthly_contribution_minor) if g.monthly_contribution_minor else None,
             "planned_monthly_minor": g.monthly_contribution_minor,
             "average_monthly_contribution": _fmt(ctx, g.average_monthly_minor), "average_monthly_minor": g.average_monthly_minor,
             "required_monthly": _fmt(ctx, g.required_monthly_minor) if g.required_monthly_minor else None,
             "required_monthly_minor": g.required_monthly_minor,
             "projected_completion": g.projected_completion_on.isoformat() if g.projected_completion_on else None,
             "on_track": g.on_track, "projection_basis": "planned monthly contribution" if g.monthly_contribution_minor else "average contributions"}
            for g in selected]
    return ToolOutput(
        {"goals": rows, "note": "Projected completion is an estimate based on contributions continuing at the same pace."},
        [{"type": "progress", "title": "Savings goals", "items": [
            {"label": g.name, "current_minor": g.saved_minor, "target_minor": g.target_minor, "pct": g.pct_complete,
             "status": "on_track" if g.on_track else ("behind" if g.on_track is False else "no_date"),
             "hint": (f"Est. {g.projected_completion_on:%b %Y}" if g.projected_completion_on else "No projection yet")}
            for g in selected]}],
    )


class FuturePurchaseArgs(BaseModel):
    item: str = Field(..., description="What the user wants to buy, e.g. 'iPhone 18 Pro' or 'MacBook'")
    price: float | None = Field(None, description="Price in major units. Use the user's figure. If they gave none, give your "
                                "best rough estimate of the price in the user's currency and set price_is_estimate to true. "
                                "Null only if you cannot estimate it (a matching savings goal's target is then used).")
    price_is_estimate: bool = Field(False, description="True when the price is your estimate rather than the user's figure")
    target_date: str | None = Field(None, description="YYYY-MM-DD when they want it; for a month use its first day "
                                     "(July 2028 → 2028-07-01); null when they gave no date")
    months_from_now: int | None = Field(None, description="Instead of a date: in how many months (e.g. 'in 8 months' → 8)")


def _months_between(start: date, end: date) -> int:
    return max(1, (end.year - start.year) * 12 + end.month - start.month)


@tool("plan_future_purchase", "Savings prediction for something the user wants to buy later, even with no goal set up: "
      "months until the target date, how much to save each month and week, how that compares with their usual monthly "
      "surplus (average income minus spending over recent full months), and when they would have it at their current "
      "pace. Uses a matching savings goal's saved amount (and its target when no price is given). Use for 'I plan to buy "
      "X in <month/year>, how much should I save?', 'magkano ipon ko?' and 'when can I afford my X?'. Always estimates.",
      FuturePurchaseArgs, "Planning your savings")
async def plan_future_purchase(ctx: ToolContext, args: FuturePurchaseArgs) -> ToolOutput:
    item = args.item.strip()[:60] or "This purchase"
    wanted = item.lower()
    goal = next((g for g in await goals.list_goals(ctx.db, ctx.user_id, ctx.today) if g.status.value == "active" and (
        wanted in g.name.lower() or g.name.lower() in wanted)), None)
    target: date | None = None
    if args.target_date:
        target = date.fromisoformat(args.target_date[:10])
    elif args.months_from_now:
        target = add_months(ctx.today, min(max(1, args.months_from_now), 600))
    if target is not None and target <= ctx.today:
        return ToolOutput({"error": "That date has already passed. Ask for a future date."})
    if target is None and goal is not None and goal.target_date:
        target = goal.target_date
    months = _months_between(ctx.today, target) if target else None
    surplus = await planned_service.monthly_surplus(ctx.db, ctx.user_id, ctx.today)
    common: dict[str, Any] = {
        "item": item, "today": ctx.today.isoformat(), "target_date": target.isoformat() if target else None,
        "months_left": months,
        "usual_monthly_surplus": _fmt(ctx, surplus) if surplus is not None else None, "usual_monthly_surplus_minor": surplus,
        "usual_monthly_overspend": _fmt(ctx, -surplus) if surplus is not None and surplus < 0 else None,
        "surplus_basis": "average income minus spending over the last 3 full months" if surplus is not None
        else "not enough full months of income and spending yet",
    }

    if args.price:
        price, source = to_minor(args.price, ctx.currency), ("estimate" if args.price_is_estimate else "you")
    elif goal is not None:
        price, source = goal.target_minor, "goal"
    else:
        return ToolOutput({**common, "needs_price": True,
                           "note": "No price and no matching goal. Estimate the price (price_is_estimate) or ask for it."})

    saved = goal.saved_minor if goal is not None else 0
    remaining = max(0, price - saved)
    unit = minor_factor(ctx.currency)  # savings targets round up to whole pesos
    monthly = math.ceil(remaining / months / unit) * unit if months else None
    weekly = math.ceil(monthly * 12 / 52 / unit) * unit if monthly is not None else None
    ready = affordable_on(remaining, 0, surplus, ctx.today) if remaining else ctx.today
    result = {
        **common,
        "price": _fmt(ctx, price), "price_minor": price, "price_source": source,
        "matching_goal": goal.name if goal is not None else None,
        "saved_so_far": _fmt(ctx, saved), "saved_so_far_minor": saved,
        "still_needed": _fmt(ctx, remaining), "still_needed_minor": remaining,
        "save_per_month": _fmt(ctx, monthly) if monthly is not None else None, "save_per_month_minor": monthly,
        "save_per_week": _fmt(ctx, weekly) if weekly is not None else None, "save_per_week_minor": weekly,
        "share_of_usual_surplus_pct": round(monthly / surplus * 100) if monthly and surplus and surplus > 0 else None,
        "ready_at_current_pace": ready.isoformat() if ready else None,
        "on_track_for_target": (ready <= target) if ready and target else None,
        "is_estimate": True,
        "note": "Projections assume the usual monthly surplus keeps coming in and all of it goes to this purchase.",
    }
    title = f"{item} by {target:%b %Y}" if target else item
    stats: list[dict[str, Any]] = [{"label": "Price" + (" (estimate)" if source == "estimate" else ""), "amount_minor": price}]
    if saved:
        stats.append({"label": "Saved so far", "amount_minor": saved, "hint": goal.name if goal is not None else None})
    if monthly is not None:
        stats.append({"label": "Save each month", "amount_minor": monthly, "hint": f"for {months} months · ≈ {_fmt(ctx, weekly or 0)}/week"})
    if surplus is not None and surplus > 0:
        stats.append({"label": "You usually save", "amount_minor": surplus,
                      "hint": f"a month · ready ≈ {ready:%b %Y}" if ready else "a month"})
    elif surplus is not None:
        stats.append({"label": "You usually overspend", "amount_minor": -surplus, "hint": "a month, last 3 months"})
    return ToolOutput(result, [{"type": "stats", "title": title, "items": stats}])


class UpcomingArgs(BaseModel):
    days: int = Field(30, ge=1, le=90)


@tool("get_upcoming_payments", "Scheduled bills, subscriptions, loan payments and expected income due within the next N days.",
      UpcomingArgs, "Looking at upcoming bills")
async def get_upcoming_payments(ctx: ToolContext, args: UpcomingArgs) -> ToolOutput:
    items = await recurring.upcoming(ctx.db, ctx.user_id, ctx.today, ctx.today + timedelta(days=args.days))
    bills = [i for i in items if not i["is_income"]]
    income = [i for i in items if i["is_income"]]
    total_bills = sum(i["amount_minor"] for i in bills)
    total_income = sum(i["amount_minor"] for i in income)
    fmt_item = lambda i: {"name": i["name"], "kind": i["kind"], "amount": _fmt(ctx, i["amount_minor"]),  # noqa: E731
                          "amount_minor": i["amount_minor"], "due_on": i["due_on"], "overdue": i["is_overdue"]}
    return ToolOutput(
        {"window": {"start": ctx.today.isoformat(), "end": (ctx.today + timedelta(days=args.days)).isoformat()},
         "bills": [fmt_item(i) for i in bills], "total_bills": _fmt(ctx, total_bills), "total_bills_minor": total_bills,
         "expected_income": [fmt_item(i) for i in income], "total_expected_income": _fmt(ctx, total_income),
         "total_expected_income_minor": total_income},
        [{"type": "list", "title": f"Upcoming · next {args.days} days", "total_minor": total_bills, "items": [
            {"label": i["name"], "amount_minor": i["amount_minor"] * (1 if i["is_income"] else -1),
             "hint": f"{date.fromisoformat(i['due_on']):%b %-d}" + (" · overdue" if i["is_overdue"] else "")}
            for i in items[:12]]}],
    )


class RecurringArgs(BaseModel):
    kind: Literal["bill", "subscription", "rent", "loan", "insurance", "income", "other"] | None = None


@tool("get_recurring_payments", "All recurring payments (subscriptions, bills, rent, loans, insurance, income) with amount, "
      "frequency, monthly equivalent and next due date.", RecurringArgs, "Listing recurring payments")
async def get_recurring_payments(ctx: ToolContext, args: RecurringArgs) -> ToolOutput:
    rows = await recurring.list_recurring(ctx.db, ctx.user_id, ctx.today, active_only=True)
    if args.kind:
        rows = [r for r in rows if r.kind.value == args.kind]
    outflows = [r for r in rows if r.kind.value != "income"]
    monthly = sum(r.monthly_equivalent_minor for r in outflows)
    return ToolOutput(
        {"count": len(rows), "monthly_total_outflows": _fmt(ctx, monthly), "monthly_total_outflows_minor": monthly,
         "yearly_total_outflows": _fmt(ctx, monthly * 12), "yearly_total_outflows_minor": monthly * 12,
         "payments": [{"name": r.name, "kind": r.kind.value, "amount": _fmt(ctx, r.amount_minor), "amount_minor": r.amount_minor,
                       "frequency": r.frequency.value, "monthly_equivalent": _fmt(ctx, r.monthly_equivalent_minor),
                       "monthly_equivalent_minor": r.monthly_equivalent_minor, "next_due_on": r.next_due_on.isoformat()}
                      for r in rows]},
        [{"type": "list", "title": "Recurring payments", "total_minor": monthly, "total_label": "Per month", "items": [
            {"label": r.name, "amount_minor": r.amount_minor, "hint": f"{r.frequency.value.replace('_', '-')} · next {r.next_due_on:%b %-d}"}
            for r in rows]}],
    )


def _scenario_blocks(ctx: ToolContext, data: dict[str, Any], title: str) -> list[dict[str, Any]]:
    reason_text = {
        "negative_balance": "Your spendable balance could go below zero.",
        "below_buffer": "It would leave less than your safety buffer.",
        "downside_negative": "If spending runs higher than usual, you could go negative.",
        "budget_exceeded": "It would push a category over budget.",
        "limited_history": "There is limited spending history, so this estimate is less reliable.",
    }
    return [
        {"type": "calculation", "title": title, "lines": data["lines"], "result_label": "Projected balance at "
         + date.fromisoformat(data["horizon_end"]).strftime("%b %-d"), "result_minor": data["projected_minor"],
         "note": "Calculated by Faldo from your balances, scheduled bills, planned savings and typical spending. Estimate."},
        {"type": "risk", "level": data["risk_level"], "verdict": data["verdict"],
         "reasons": [reason_text.get(r["code"], r["code"]) for r in data["reasons"]]},
        {"type": "forecast", "title": "Projected spendable balance", "series": data["scenario_series"],
         "baseline": data["baseline_series"], "buffer_minor": data["buffer_minor"]},
    ]


def _scenario_llm(ctx: ToolContext, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "horizon_end": data["horizon_end"],
        "calculation": [{"label": line["label"], "operation": line["op"], "amount": _fmt(ctx, line["amount_minor"]),
                         "amount_minor": line["amount_minor"]} for line in data["lines"]],
        "projected_balance": _fmt(ctx, data["projected_minor"]), "projected_balance_minor": data["projected_minor"],
        "without_change": _fmt(ctx, data["baseline_projected_minor"]), "without_change_minor": data["baseline_projected_minor"],
        "likely_range": {"low": _fmt(ctx, data["range"]["p10"]), "high": _fmt(ctx, data["range"]["p90"])},
        "risk_level": data["risk_level"], "verdict": data["verdict"], "reasons": data["reasons"],
        "planned_savings_at_risk": _fmt(ctx, data["savings_at_risk_minor"]), "planned_savings_at_risk_minor": data["savings_at_risk_minor"],
        "goal_delay_days": data["goal_delay_days"], "safety_buffer": _fmt(ctx, data["buffer_minor"]),
        "data_sufficiency": data["sufficiency"], "is_estimate": True,
    }


class AffordArgs(BaseModel):
    amount: float = Field(..., gt=0, description="Purchase amount in major units, e.g. 3000 for ₱3,000")
    description: str | None = Field(None, description="What the purchase is")
    category: str | None = Field(None, description="Budget category it would count toward")
    date: str | None = Field(None, description="YYYY-MM-DD purchase date; null for today")


@tool("calculate_affordability", "Faldo Check: whether the user can afford a purchase. Returns Safe to Spend before and "
      "after, what's left for this week, the verdict (fits / stretch / over), budget impact, goal impact, and a "
      "projected balance with risk level.", AffordArgs, "Running Faldo Check")
async def calculate_affordability(ctx: ToolContext, args: AffordArgs) -> ToolOutput:
    amount = to_minor(args.amount, ctx.currency)
    on = date.fromisoformat(args.date) if args.date else ctx.today + timedelta(days=1)
    on = max(on, ctx.today + timedelta(days=1))
    category = await _find_category(ctx, args.category) if args.category else None
    check = await check_service.check_purchase(ctx.db, ctx.user_id, ctx.settings, ctx.today, amount,
                                               category.id if category else None, args.description)
    budget = check["budget_impact"]
    label = f"Purchase{': ' + args.description if args.description else ''}"
    data = await forecast.scenario(ctx.db, ctx.user_id, ctx.settings, ctx.today,
                                   [Adjustment("one_time_expense", amount, on, label[:60])],
                                   budget_over=bool(budget and budget["would_exceed"]))
    result = _scenario_llm(ctx, data)
    goal = check["goal_impact"]
    result.update({
        "purchase": _fmt(ctx, amount), "purchase_minor": amount,
        "check_verdict": check["verdict"],
        "safe_to_spend_before": _fmt(ctx, check["safe_before_minor"]), "safe_to_spend_before_minor": check["safe_before_minor"],
        "safe_to_spend_after": _fmt(ctx, check["safe_after_minor"]), "safe_to_spend_after_minor": check["safe_after_minor"],
        "over_safe_to_spend_by": _fmt(ctx, check["over_by_minor"]), "over_safe_to_spend_by_minor": check["over_by_minor"],
        "left_this_week_before": _fmt(ctx, check["week_left_before_minor"]),
        "left_this_week_before_minor": check["week_left_before_minor"],
        "per_day_after": _fmt(ctx, check["per_day_after_minor"]), "per_day_after_minor": check["per_day_after_minor"],
        "safe_to_spend_until": check["until"],
        "budget_impact": {"category": budget["category"], "remaining_before": _fmt(ctx, budget["remaining_before_minor"]),
                          "remaining_before_minor": budget["remaining_before_minor"],
                          "remaining_after": _fmt(ctx, budget["remaining_after_minor"]),
                          "remaining_after_minor": budget["remaining_after_minor"],
                          "would_exceed": budget["would_exceed"]} if budget else None,
        "goal_impact": {"goal": goal["goal"], "savings_at_risk": _fmt(ctx, goal["savings_at_risk_minor"]),
                        "savings_at_risk_minor": goal["savings_at_risk_minor"], "estimated_delay_days": goal["delay_days"],
                        "is_estimate": True} if goal else None,
    })
    blocks = _scenario_blocks(ctx, data, "Can you afford it?")
    blocks.insert(0, {"type": "stats", "title": "Faldo Check", "items": [
        {"label": "Safe to spend now", "amount_minor": check["safe_before_minor"]},
        {"label": "After this purchase", "amount_minor": check["safe_after_minor"],
         "hint": f"≈ {_fmt(ctx, check['per_day_after_minor'])}/day"},
    ]})
    if budget:
        blocks.insert(1, {"type": "stats", "title": f"{budget['category']} budget", "items": [
            {"label": "Remaining now", "amount_minor": budget["remaining_before_minor"]},
            {"label": "After purchase", "amount_minor": budget["remaining_after_minor"]},
        ]})
    return ToolOutput(result, blocks)


class ForecastArgs(BaseModel):
    horizon: Literal["end_of_month", "30_days", "60_days", "90_days"] = "end_of_month"


@tool("calculate_forecast", "Projected spendable balance through a horizon using scheduled bills, expected income, planned "
      "savings and historical spending patterns. Returns likely range (p10–p90), lowest point and assumptions. Always an "
      "estimate.", ForecastArgs, "Projecting your balance")
async def calculate_forecast(ctx: ToolContext, args: ForecastArgs) -> ToolOutput:
    fc = await forecast.forecast(ctx.db, ctx.user_id, ctx.settings, ctx.today, args.horizon)
    end = fc["end_balance"]
    return ToolOutput(
        {"is_estimate": True, "horizon_end": fc["horizon_end"], "current_spendable_balance": _fmt(ctx, fc["start_balance_minor"]),
         "current_spendable_balance_minor": fc["start_balance_minor"],
         "projected_end_balance": _fmt(ctx, end["p50"]), "projected_end_balance_minor": end["p50"],
         "likely_range_low": _fmt(ctx, end["p10"]), "likely_range_low_minor": end["p10"],
         "likely_range_high": _fmt(ctx, end["p90"]), "likely_range_high_minor": end["p90"],
         "lowest_point": _fmt(ctx, fc["lowest_point"]["p50_minor"]), "lowest_point_minor": fc["lowest_point"]["p50_minor"],
         "lowest_point_date": fc["lowest_point"]["date"],
         "expected_income": _fmt(ctx, fc["expected_income_minor"]), "expected_income_minor": fc["expected_income_minor"],
         "scheduled_outflows": _fmt(ctx, fc["scheduled_outflows_minor"]), "scheduled_outflows_minor": fc["scheduled_outflows_minor"],
         "typical_everyday_spending": _fmt(ctx, fc["projected_discretionary_minor"]),
         "typical_everyday_spending_minor": fc["projected_discretionary_minor"],
         "scheduled_events": [{"date": e["date"], "label": e["label"], "amount": _fmt(ctx, e["amount_minor"]),
                               "amount_minor": e["amount_minor"]} for e in fc["events"][:15]],
         "assumptions": fc["assumptions"], "data_sufficiency": fc["sufficiency"], "history_days": fc["history_days"]},
        [{"type": "forecast", "title": f"Projected balance to {date.fromisoformat(fc['horizon_end']):%b %-d}",
          "series": fc["days"], "actual": fc["actual"], "buffer_minor": fc["buffer_minor"]},
         {"type": "stats", "title": "Forecast (estimate)", "items": [
             {"label": "Spendable now", "amount_minor": fc["start_balance_minor"]},
             {"label": "Projected end", "amount_minor": end["p50"], "hint": f"{_fmt(ctx, end['p10'])} – {_fmt(ctx, end['p90'])}"},
             {"label": "Lowest point", "amount_minor": fc["lowest_point"]["p50_minor"],
              "hint": date.fromisoformat(fc["lowest_point"]["date"]).strftime("%b %-d")},
         ]}],
    )


class AdjustmentArg(BaseModel):
    kind: Literal["one_time_expense", "one_time_income", "extra_savings", "reduce_savings", "income_decrease"] = Field(
        ..., description="one_time_expense = extra spending, one_time_income = extra income, income_decrease = less income")
    amount: float = Field(..., gt=0, description="Major units, per occurrence")
    repeat: Literal["once", "daily", "weekly", "monthly"] = Field(
        "once", description="How often it happens, e.g. 'daily' for ₱200 a day, 'monthly' for saving ₱2,000 every month")
    date: str | None = Field(None, description="YYYY-MM-DD first date; null for tomorrow")
    label: str | None = None


class ScenarioArgs(BaseModel):
    adjustments: list[AdjustmentArg] = Field(..., min_length=1, max_length=5)
    horizon: Literal["end_of_month", "30_days", "60_days", "90_days", "6_months", "12_months"] = Field(
        "end_of_month", description="Use 6_months or 12_months for monthly or recurring changes")


@tool("simulate_scenario", "What-if simulation: apply hypothetical one-off or repeating changes (extra spending, extra or "
      "lower income, more or less saving) and compare the projected balance with the baseline. Returns calculation, risk "
      "level and projected series.", ScenarioArgs, "Simulating the scenario")
async def simulate_scenario(ctx: ToolContext, args: ScenarioArgs) -> ToolOutput:
    labels = {"one_time_expense": "Planned expense", "one_time_income": "Extra income", "extra_savings": "Extra savings",
              "reduce_savings": "Reduced savings", "income_decrease": "Less income"}
    adjustments = []
    for a in args.adjustments:
        on = date.fromisoformat(a.date) if a.date else ctx.today + timedelta(days=1)
        adjustments.append(Adjustment(a.kind, to_minor(a.amount, ctx.currency), max(on, ctx.today + timedelta(days=1)),
                                      (a.label or labels[a.kind])[:60], None, a.repeat))
    data = await forecast.scenario(ctx.db, ctx.user_id, ctx.settings, ctx.today, adjustments, args.horizon)
    return ToolOutput(_scenario_llm(ctx, data), _scenario_blocks(ctx, data, "What-if result"))


class MemoryArgs(BaseModel):
    query: str = Field(..., description="Short search phrase with key terms and synonyms, e.g. 'shoes sneakers footwear'")
    period: PeriodArg | None = None
    start_date: str | None = None
    end_date: str | None = None
    entity_types: list[MEMORY_TYPES] | None = None
    limit: int = Field(12, ge=1, le=25)


@tool("search_financial_memory", "Semantic + keyword search over the user's financial memory: transactions, purchase items, "
      "notes, monthly summaries, goals, budgets, recurring payments, debts and past insights. Use for products, brands, "
      "free-text topics and context. Results are candidates: judge relevance yourself, then call sum_transactions with the "
      "relevant refs to get exact totals. Never total amounts from snippets yourself.", MemoryArgs,
      "Searching your financial history")
async def search_financial_memory(ctx: ToolContext, args: MemoryArgs) -> ToolOutput:
    period = _period(ctx, args.period, args.start_date, args.end_date) if args.period else None
    hits = await search_memory(
        ctx.db, ctx.user_id, args.query, entity_types=list(args.entity_types) if args.entity_types else None,
        date_from=period.start if period else None, date_to=period.end if period else None, limit=args.limit,
    )
    results = []
    for hit in hits:
        entry: dict[str, Any] = {"kind": hit.entity_type, "date": hit.occurred_on.isoformat() if hit.occurred_on else None,
                                 "text": hit.content, "relevance": round(hit.score, 4)}
        if hit.entity_type == "transaction":
            ref = ctx.add_ref("t", f"transaction:{hit.entity_id}", {
                "type": "transaction", "id": str(hit.entity_id), "label": hit.metadata.get("merchant") or hit.content.split("\n")[0][:60],
                "date": entry["date"], "snippet": hit.content[:240],
            })
        elif hit.entity_type == "transaction_item":
            ref = ctx.add_ref("i", f"item:{hit.entity_id}", {
                "type": "transaction_item", "id": str(hit.entity_id), "transaction_id": hit.metadata.get("transaction_id"),
                "label": hit.metadata.get("item_name") or hit.content.split("\n")[0][:60], "date": entry["date"],
                "snippet": hit.content[:240], "amount_minor": hit.amount_minor,
            })
            entry.update({"item_name": hit.metadata.get("item_name"), "merchant": hit.metadata.get("merchant"),
                          "subcategory": hit.metadata.get("subcategory"), "items_in_purchase": hit.metadata.get("item_count")})
        else:
            ref = ctx.add_ref("m", f"{hit.entity_type}:{hit.entity_id}", {
                "type": hit.entity_type, "id": str(hit.entity_id), "label": hit.content.split("\n")[0][:80],
                "date": entry["date"], "snippet": hit.content[:240],
            })
        results.append({"ref": ref, **entry})
    return ToolOutput({"query": args.query, "period": period.as_dict() if period else None, "result_count": len(results),
                       "results": results,
                       "instructions": "Amounts in text are for identification only. Use sum_transactions with the "
                                       "relevant t (whole purchase) or i (single item) refs for totals."})


class SumArgs(BaseModel):
    refs: list[str] = Field(..., min_length=1, max_length=60,
                            description="Refs from earlier results: t# for whole transactions, i# for individual purchase items")


@tool("sum_transactions", "Exact deterministic total of specific transactions (t refs) and purchase items (i refs) "
      "identified in earlier results, e.g. the relevant results of search_financial_memory. Use this instead of adding "
      "amounts yourself.", SumArgs, "Calculating the exact total")
async def sum_transactions(ctx: ToolContext, args: SumArgs) -> ToolOutput:
    txn_ids: set[uuid.UUID] = set()
    item_ids: set[uuid.UUID] = set()
    unknown = []
    for ref in dict.fromkeys(args.refs):
        info = ctx.refs.get(ref)
        if info and info.get("type") == "transaction":
            txn_ids.add(uuid.UUID(info["id"]))
        elif info and info.get("type") == "transaction_item":
            item_ids.add(uuid.UUID(info["id"]))
        else:
            unknown.append(ref)
    total_txn = 0
    if txn_ids:
        total_txn = int(await ctx.db.scalar(
            select(func.coalesce(func.sum(Transaction.amount_minor), 0))
            .where(Transaction.user_id == ctx.user_id, Transaction.id.in_(txn_ids))
        ) or 0)
    item_rows: list[Any] = []
    if item_ids:
        item_rows = [r for r in (await ctx.db.execute(
            select(TransactionItem.id, TransactionItem.name, TransactionItem.amount_minor, Transaction.occurred_on,
                   Transaction.id.label("transaction_id"))
            .join(Transaction, Transaction.id == TransactionItem.transaction_id)
            .where(TransactionItem.user_id == ctx.user_id, TransactionItem.id.in_(item_ids))
        )).all() if r.transaction_id not in txn_ids]
    total = total_txn + sum(r.amount_minor for r in item_rows)
    purchase_ids = txn_ids | {r.transaction_id for r in item_rows}
    listing = await list_transactions(ctx.db, ctx.user_id, TransactionFilters(ids=list(purchase_ids)), limit=60)
    llm_rows, block_rows = _txn_rows(ctx, listing.items)
    return ToolOutput(
        {"total": _fmt(ctx, total), "total_minor": total, "purchase_count": len(purchase_ids),
         "counted_items": [{"item": r.name, "amount": _fmt(ctx, r.amount_minor), "amount_minor": r.amount_minor,
                            "date": r.occurred_on.isoformat()} for r in item_rows],
         "counted_whole_transactions": [row for row in llm_rows if uuid.UUID(ctx.refs[row["ref"]]["id"]) in txn_ids],
         "unknown_refs": unknown},
        [{"type": "list", "title": "Counted in this total", "total_minor": total, "items": [
            {"label": r.name, "amount_minor": r.amount_minor, "hint": r.occurred_on.strftime("%b %-d, %Y")} for r in item_rows
        ] + [{"label": row["merchant"] or row["category"] or "Transaction", "amount_minor": row["amount_minor"],
              "hint": date.fromisoformat(row["date"]).strftime("%b %-d, %Y")}
             for row in block_rows if uuid.UUID(row["id"]) in txn_ids]}],
    )


class CalcArgs(BaseModel):
    expression: str = Field(..., description="Arithmetic on numbers already returned by tools, e.g. '35000 - 18420'")


@tool("calculate", "Deterministic calculator for derived numbers (differences, ratios, per-month amounts). Only + - * / and "
      "parentheses on numbers from tool results.", CalcArgs, "Doing the math")
async def calculate(ctx: ToolContext, args: CalcArgs) -> ToolOutput:
    value = evaluate(args.expression)
    return ToolOutput({"expression": args.expression, "result": str(value.quantize(Decimal("0.01")))})


@tool("get_financial_health", "Transparent financial health score with each factor, its value, score, weight and formula. "
      "Not a credit score or professional assessment.", NoArgs, "Scoring your financial health")
async def get_financial_health(ctx: ToolContext, _: NoArgs) -> ToolOutput:
    data = await health.health_score(ctx.db, ctx.user_id, ctx.today)
    return ToolOutput(data, [{"type": "health", **data}])


@tool("get_debts", "Money the user owes and money owed to them, with outstanding amounts, due dates and status.", NoArgs,
      "Checking money owed")
async def get_debts(ctx: ToolContext, _: NoArgs) -> ToolOutput:
    rows = await debts.list_debts(ctx.db, ctx.user_id, ctx.today)
    i_owe = sum(d.outstanding_minor for d in rows if d.direction.value == "i_owe" and d.status.value == "open")
    owed = sum(d.outstanding_minor for d in rows if d.direction.value == "owed_to_me" and d.status.value == "open")
    return ToolOutput(
        {"total_i_owe": _fmt(ctx, i_owe), "total_i_owe_minor": i_owe, "total_owed_to_me": _fmt(ctx, owed), "total_owed_to_me_minor": owed,
         "records": [{"direction": d.direction.value, "person": d.counterparty, "outstanding": _fmt(ctx, d.outstanding_minor),
                      "outstanding_minor": d.outstanding_minor, "due_on": d.due_on.isoformat() if d.due_on else None,
                      "status": d.status.value, "overdue": d.is_overdue} for d in rows]},
        [{"type": "list", "title": "Money owed", "items": [
            {"label": ("You owe " if d.direction.value == "i_owe" else "Owes you: ") + d.counterparty,
             "amount_minor": -d.outstanding_minor if d.direction.value == "i_owe" else d.outstanding_minor,
             "hint": d.status.value + (f" · due {d.due_on:%b %-d}" if d.due_on else "")} for d in rows if d.status.value == "open"]}],
    )


@tool("get_money_plan", "The user's Money Plan: income per payday, how it is split (bills, needs, Joy Money for wants, "
      "savings, buffer), unassigned money, and Joy Money and needs spent and left this pay period and this week.", NoArgs,
      "Checking your money plan")
async def get_money_plan(ctx: ToolContext, _: NoArgs) -> ToolOutput:
    data = await money_plan.get_money_plan(ctx.db, ctx.user_id, ctx.settings, ctx.today)
    if not data["configured"] or not data["allocation"]:
        return ToolOutput({"configured": False, "note": "No money plan yet. The user can set one on Plan > Money plan."})
    sts = await forecast.safe_to_spend(ctx.db, ctx.user_id, ctx.settings, ctx.today)
    week = sts["week"].get("plan") or {}
    buckets = data["allocation"]["buckets"]
    period = data["this_period"]
    return ToolOutput(
        {"configured": True, "period": data["period"]["label"], "income_per_period": _fmt(ctx, data["income"]["minor"]),
         "income_per_period_minor": data["income"]["minor"],
         "allocation": [{"bucket": b["label"], "amount": _fmt(ctx, b["amount_minor"]), "amount_minor": b["amount_minor"],
                         "percent_of_income": b["pct"]} for b in buckets],
         "unassigned": _fmt(ctx, data["allocation"]["unassigned_minor"]), "unassigned_minor": data["allocation"]["unassigned_minor"],
         "joy_money_this_period": _fmt(ctx, period["joy_minor"]), "joy_money_this_period_minor": period["joy_minor"],
         "joy_money_spent_this_period": _fmt(ctx, period["joy_spent_minor"]), "joy_money_spent_this_period_minor": period["joy_spent_minor"],
         "joy_money_left_this_period": _fmt(ctx, period["joy_left_minor"]), "joy_money_left_this_period_minor": period["joy_left_minor"],
         "joy_money_left_this_week": _fmt(ctx, week.get("joy_left_minor", 0)), "joy_money_left_this_week_minor": week.get("joy_left_minor", 0),
         "needs_left_this_week": _fmt(ctx, week.get("needs_left_minor", 0)), "needs_left_this_week_minor": week.get("needs_left_minor", 0),
         "note": "Needs are categories the user marked essential; everything else counts as Joy Money."},
        [{"type": "list", "title": f"Money plan · {data['period']['label']}", "items": [
            {"label": b["label"], "amount_minor": b["amount_minor"], "hint": f"{b['pct']:g}%" if b["pct"] is not None else None}
            for b in buckets]},
         {"type": "stats", "title": "Joy Money", "items": [
             {"label": "This pay period", "amount_minor": period["joy_minor"]},
             {"label": "Spent", "amount_minor": period["joy_spent_minor"]},
             {"label": "Left", "amount_minor": period["joy_left_minor"]},
         ]}],
    )


@tool("get_insights", "Active proactive insights detected from the user's data (budget risks, spending increases, unusual "
      "transactions, reminders, cash-flow warnings, goal progress).", NoArgs, "Reviewing your insights")
async def get_insights(ctx: ToolContext, _: NoArgs) -> ToolOutput:
    rows = await insights.list_insights(ctx.db, ctx.user_id)
    return ToolOutput({"insights": [{"type": i.type, "severity": i.severity.value, "title": i.title, "detail": i.body, "facts": i.facts}
                                    for i in rows if i.type != "pulse"][:10]})

