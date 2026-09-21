import re
from datetime import date
from typing import Any

from app.ai.providers.base import CaptureContext, ModelTurn, ProviderUnavailable, ToolCall, TranscriptItem
from app.ai.providers.local_embeddings import DOMAIN_LEXICON

PERIOD_PATTERNS: list[tuple[str, str]] = [
    (r"\btoday\b", "today"),
    (r"\byesterday\b", "yesterday"),
    (r"\bthis week\b", "this_week"),
    (r"\blast week\b", "last_week"),
    (r"\blast month\b", "last_month"),
    (r"\b(last|past) 30 days\b", "last_30_days"),
    (r"\b(last|past) (3|three) months\b|\blately\b|\brecently\b", "last_90_days"),
    (r"\blast year\b", "last_year"),
    (r"\bthis year\b|\bso far this year\b|\bytd\b", "this_year"),
    (r"\bthis month\b", "this_month"),
]

AMOUNT_RE = re.compile(r"(?:₱|php|p)?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(k)?\b", re.IGNORECASE)
TOPIC_RE = re.compile(
    r"(?:spend|spent|spending|pay|paid|buy|bought)(?:\s+(?:more|less|much|so much|too much|a lot))?\s+(?:on|for|at|in)\s+(.+?)"
    r"(?:\s+(?:this|last|in|so far|since|over|during|lately|recently|per|each|every)\b|[?.!]|$)",
    re.IGNORECASE,
)
GOAL_RE = re.compile(r"(?:afford|reach|hit|complete|finish|save for|saving for|buy)\s+(?:my|the|a|an)?\s*(.+?)(?:\s+goal)?(?:[?.!]|$)", re.IGNORECASE)
STOP_TOPICS = {"it", "that", "this", "things", "stuff", "everything", "money", "anything", "food lately"}


def _period(text: str, default: str = "this_month") -> str:
    lowered = text.lower()
    for pattern, name in PERIOD_PATTERNS:
        if re.search(pattern, lowered):
            return name
    return default


def _amount(text: str) -> float | None:
    for match in AMOUNT_RE.finditer(text):
        whole = match.group(1).replace(",", "")
        value = float(f"{whole}.{match.group(2) or '0'}")
        if match.group(3):
            value *= 1000
        if value >= 20 or match.group(3) or "₱" in text:
            return value
    return None


def _topic(text: str) -> str | None:
    match = TOPIC_RE.search(text)
    if not match:
        return None
    topic = re.sub(r"^(my|the|a|an)\s+", "", match.group(1).strip(), flags=re.IGNORECASE).strip(" ?.")
    return None if not topic or topic.lower() in STOP_TOPICS or len(topic) > 40 else topic


def _call(name: str, **arguments: Any) -> ToolCall:
    return ToolCall(id=f"local_{name}", name=name, arguments=arguments)


def plan(question: str) -> tuple[str, list[ToolCall]]:
    q = question.lower()
    period = _period(q)
    amount = _amount(question)
    topic = _topic(question)

    if re.search(r"what (happens|if)|if i (spend|save|buy|put|get)|if my (income|salary|allowance)", q) and amount:
        kind = "income_decrease" if re.search(r"(income|salary|allowance|pay) (drops|goes down|decreases|is cut)|earn less", q) \
            else "extra_savings" if re.search(r"\bsave|put .* savings", q) \
            else "one_time_income" if re.search(r"\b(earn|bonus|receive|get paid)", q) else "one_time_expense"
        repeat = "daily" if re.search(r"\b(a|per|every|each) day\b|daily", q) else (
            "weekly" if re.search(r"\b(a|per|every|each) week\b|weekly", q) else (
                "monthly" if re.search(r"\b(a|per|every|each) month\b|monthly", q) or kind == "income_decrease" else "once"))
        horizon = "12_months" if repeat == "monthly" else ("90_days" if repeat == "weekly" else "end_of_month")
        return "scenario", [_call("simulate_scenario", adjustments=[
            {"kind": kind, "amount": amount, "repeat": repeat, "date": None, "label": None}], horizon=horizon)]
    if re.search(r"\bafford\b|can i (buy|get)|should i (buy|get)", q):
        if amount:
            return "afford", [_call("calculate_affordability", amount=amount, description=None, category=None, date=None)]
        goal = GOAL_RE.search(question)
        return "goal", [_call("get_goal_progress", goal_name=goal.group(1).strip() if goal else None)]
    if re.search(r"running out|run out of money|always broke|short on (cash|money)|why am i (broke|short)|money disappear", q):
        return "running_out", [
            _call("compare_spending", period="this_month"),
            _call("get_upcoming_payments", days=30),
            _call("calculate_forecast", horizon="end_of_month"),
            _call("get_recurring_payments", kind=None),
            _call("search_financial_memory", query="short on money borrowed lent emergency unexpected", period="last_90_days",
                  start_date=None, end_date=None, entity_types=["financial_note", "insight"], limit=5),
        ]
    if re.search(r"subscription", q):
        return "recurring", [_call("get_recurring_payments", kind="subscription")]
    if re.search(r"recurring|bills do i have|monthly bills|fixed (costs|expenses)", q):
        return "recurring", [_call("get_recurring_payments", kind=None)]
    if re.search(r"upcoming|due soon|bills (due|coming)|what.*due", q):
        return "upcoming", [_call("get_upcoming_payments", days=30)]
    if re.search(r"\b(owe|debt|utang|lent|borrowed|owed)\b", q):
        return "debts", [_call("get_debts")]
    if re.search(r"health|score|how am i doing financially", q):
        return "health", [_call("get_financial_health")]
    if re.search(r"saving each month|savings rate|how much (am i|do i|have i been) sav|save each month|saved per month", q):
        return "savings", [_call("get_savings_summary", months=6)]
    if re.search(r"reduce|cut back|cut down|spend less|where can i save|unnecessary|wasting", q):
        return "reduce", [
            _call("get_category_spending", period="this_month", category=None, start_date=None, end_date=None),
            _call("get_budget_status", month=None),
            _call("compare_spending", period="this_month"),
            _call("get_recurring_payments", kind="subscription"),
        ]
    if re.search(r"more than last|less than last|compared (to|with)|spending more|spending less|vs\.? last|increase|went up", q):
        calls = [_call("compare_spending", period="last_month" if "last month" in q and "than last month" not in q else "this_month")]
        if topic:
            calls.append(_call("search_financial_memory", query=f"{topic} monthly summary", period="last_6_months", start_date=None,
                               end_date=None, entity_types=["monthly_summary"], limit=6))
        return "compare", calls
    if re.search(r"where did (my|the|all my) money go|breakdown|biggest expense|top expense|what did i spend", q):
        calls = [_call("get_monthly_expenses", month="last_month" if period == "last_month" else None)]
        if re.search(r"biggest|largest|top", q):
            calls.append(_call("get_transactions", period=period, start_date=None, end_date=None, type="expense", category=None,
                               search=None, min_amount=None, max_amount=None, sort="amount_desc", limit=5))
        return "where", calls
    if topic and re.search(r"how much|total|spent|spend", q):
        return "topic", [_call("get_category_spending", period=period, category=topic, start_date=None, end_date=None)]
    if re.search(r"budget", q):
        return "budget", [_call("get_budget_status", month=None)]
    if re.search(r"goal|save for|saving for|emergency fund|macbook", q):
        goal = GOAL_RE.search(question)
        name = goal.group(1).strip() if goal else None
        if name and len(name) > 30:
            name = None
        return "goal", [_call("get_goal_progress", goal_name=name)]
    if re.search(r"forecast|end of (the )?month|projected|will i have|month.?end", q):
        return "forecast", [_call("calculate_forecast", horizon="end_of_month")]
    if re.search(r"income|earn|salary|sweldo", q):
        return "income", [_call("get_monthly_income", month=None)]
    if re.search(r"balance|how much (money )?do i have|net worth|safe to spend|in my accounts", q):
        return "balance", [_call("get_current_balance")]
    if re.search(r"insight|unusual|anything (i should|to) (know|watch)|alert|warning", q):
        return "insights", [_call("get_insights")]
    if re.search(r"how much.*(spend|spent)|total spending|expenses", q):
        return "where", [_call("get_monthly_expenses", month=None)]
    if re.search(r"transaction|purchase|bought|show me|list", q):
        return "transactions", [_call("get_transactions", period=period, start_date=None, end_date=None, type=None, category=None,
                                      search=topic, min_amount=None, max_amount=None, sort="date_desc", limit=10)]
    return "memory", [_call("search_financial_memory", query=question, period=None, start_date=None, end_date=None,
                            entity_types=None, limit=8)]


def expand_terms(topic: str) -> list[str]:
    words = [w for w in re.findall(r"[a-z0-9]+", topic.lower()) if len(w) > 2]
    expanded = list(words)
    for w in words:
        expanded.extend(DOMAIN_LEXICON.get(w, []))
    stems = [w[:-1] for w in expanded if w.endswith("s") and len(w) > 3]
    return list(dict.fromkeys([*expanded, *stems]))


def _mentions(name: str, terms: list[str]) -> bool:
    lowered = name.lower()
    for term in terms:
        for match in re.finditer(rf"\b{re.escape(term)}s?\b", lowered):
            rest = lowered[match.end():].strip()
            if not rest or rest.startswith(("(", "-", ",")) or not re.match(r"[a-z]", rest):
                return True
    return False


def judge_relevance(topic: str, results: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    terms = expand_terms(topic)
    topic_words = {w for w in re.findall(r"[a-z]+", topic.lower())}
    relevant, excluded = [], []
    for r in results:
        if r["kind"] != "transaction_item":
            continue
        name = r.get("item_name") or ""
        in_subcategory = (r.get("subcategory") or "").lower() in topic_words | {t for t in terms}
        if _mentions(name, terms) or (in_subcategory and r.get("items_in_purchase") == 1):
            relevant.append(r["ref"])
        elif any(t in name.lower() for t in terms) or in_subcategory:
            excluded.append(name)
    return relevant, excluded


def _cite(rows: list[dict[str, Any]], limit: int = 3) -> str:
    return "".join(f" [{r['ref']}]" for r in rows[:limit] if r.get("ref"))


class LocalDevelopmentProvider:
    name = "local"
    is_development = True
    supports_vision = False

    async def assistant_turn(self, *, system: str, transcript: list[TranscriptItem], tools: list[dict[str, Any]]) -> ModelTurn:
        last_user = max(i for i, item in enumerate(transcript) if item.kind == "user")
        question = transcript[last_user].text or ""
        results: dict[str, dict[str, Any]] = {}
        for item in transcript[last_user + 1:]:
            if item.kind == "tool_result" and item.call and item.output is not None:
                results[item.call.name] = item.output

        intent, calls = plan(question)
        pending = [c for c in calls if c.name not in results]
        if pending:
            return ModelTurn(text=None, tool_calls=pending)

        if intent == "topic":
            category = results.get("get_category_spending", {})
            needs_items = "error" in category or category.get("category_level") == "subcategory"
            if needs_items and "search_financial_memory" not in results:
                topic = _topic(question) or question
                terms = " ".join(expand_terms(topic))
                return ModelTurn(text=None, tool_calls=[_call(
                    "search_financial_memory", query=terms, period=_period(question, "this_year"), start_date=None,
                    end_date=None, entity_types=["transaction_item", "transaction"], limit=25)])
            if needs_items and "sum_transactions" not in results:
                relevant, _ = judge_relevance(_topic(question) or question, results["search_financial_memory"].get("results", []))
                if relevant:
                    return ModelTurn(text=None, tool_calls=[_call("sum_transactions", refs=relevant)])
        return ModelTurn(text=compose(intent, question, results))

    async def parse_transactions(self, text: str, context: CaptureContext) -> dict[str, Any] | None:
        return None

    async def extract_receipt(self, image: bytes, mime_type: str, context: CaptureContext) -> dict[str, Any]:
        raise ProviderUnavailable(
            "Receipt reading needs an AI vision provider. Set OPENAI_API_KEY to enable it, or enter the details manually."
        )

    async def write_summary(self, kind: str, facts: dict[str, Any], draft: str) -> str | None:
        return None


def compose(intent: str, question: str, r: dict[str, dict[str, Any]]) -> str:
    errors = [v["error"] for v in r.values() if "error" in v]
    if errors and len(errors) == len(r):
        return f"I couldn't answer that from your data: {errors[0]}"
    return COMPOSERS.get(intent, compose_memory)(question, r)


def compose_where(question: str, r: dict[str, dict[str, Any]]) -> str:
    data = r["get_monthly_expenses"]
    cats = data.get("by_category", [])
    if not data.get("total_minor"):
        return "I don't see any expenses recorded for that period yet."
    lines = [f"You've spent {data['total_expense']} in {data['period']['label']}."]
    if cats:
        top = cats[:3]
        lines.append("Most of it went to " + ", ".join(f"{c['category']} ({c['amount']}, {c['share_pct']:g}%)" for c in top) + ".")
    if data.get("change_pct") is not None:
        direction = "more" if data["change_pct"] > 0 else "less"
        lines.append(f"That's {abs(data['change_pct']):g}% {direction} than the same days last month ({data['comparison_total']}).")
    if data.get("top_merchants"):
        m = data["top_merchants"][0]
        lines.append(f"Your top merchant was {m['merchant']} at {m['amount']} across {_plural(m['count'], 'transaction')}.")
    if "get_transactions" in r and r["get_transactions"].get("transactions"):
        biggest = r["get_transactions"]["transactions"][:3]
        lines.append("Biggest single expenses: " + "; ".join(
            f"{t['merchant'] or t['category']} {t['amount']} [{t['ref']}]" for t in biggest) + ".")
    return " ".join(lines)


def _d(value: str | None, pattern: str = "%b %-d") -> str:
    from datetime import date

    return date.fromisoformat(value).strftime(pattern) if value else ""


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def compose_topic(question: str, r: dict[str, dict[str, Any]]) -> str:
    cat = r.get("get_category_spending", {})
    topic = _topic(question) or "that"
    summed = r.get("sum_transactions")
    if summed:
        _, excluded = judge_relevance(topic, r.get("search_financial_memory", {}).get("results", []))
        items = summed.get("counted_items", [])
        text = (f"You've spent {summed['total']} on {topic} across {_plural(summed['purchase_count'], 'purchase')}"
                f" (matching items only).")
        if items:
            biggest = max(items, key=lambda i: i["amount_minor"])
            text += f" The largest was {biggest['item']} at {biggest['amount']} on {_d(biggest['date'], '%b %-d, %Y')}."
        if "error" not in cat and cat.get("transaction_count") and cat["total_minor"] != summed["total_minor"]:
            text += (f" Your {cat['category']} category total is {cat['total']}; it counts whole purchases, while this "
                     "answer counts only the matching items.")
        if excluded:
            text += " Not counted: " + ", ".join(dict.fromkeys(excluded)) + "."
        return text
    if "error" not in cat:
        if not cat.get("transaction_count"):
            return f"I didn't find any {cat['category']} transactions in {cat['period']['label']}."
        text = (f"You spent {cat['total']} on {cat['category']} in {cat['period']['label']} across "
                f"{_plural(cat['transaction_count'], 'transaction')}.")
        if cat.get("by_subcategory") and len(cat["by_subcategory"]) > 1:
            top = cat["by_subcategory"][0]
            text += f" The largest part was {top['subcategory']} at {top['amount']}."
        return text + _cite(cat.get("transactions_shown", []))
    return (f"I searched your transactions, purchase items and notes for “{topic}” but didn't find matching purchases, "
            "so there's no total to report.")


def compose_compare(question: str, r: dict[str, dict[str, Any]]) -> str:
    c = r["compare_spending"]
    if c.get("change_pct") is None:
        return (f"You've spent {c['current_total']} in {c['current_period']['label']}. There's no spending recorded for "
                f"{c['previous_period']['label']} to compare with.")
    direction = "more" if c["difference_minor"] > 0 else "less"
    text = (f"Yes — you're spending {direction}" if direction == "more" else "No — you're spending less") + (
        f": {c['current_total']} in {c['current_period']['label']} versus {c['previous_total']} in "
        f"{c['previous_period']['label']} ({c['change_pct']:+g}%).")
    topic = _topic(question)
    drivers = c.get("biggest_changes", [])
    if topic:
        match = next((d for d in drivers if topic.lower() in d["category"].lower()), None)
        if match:
            text += f" {match['category']}: {match['current']} now versus {match['previous']} ({match['change']} change)."
    elif drivers:
        d = drivers[0]
        text += f" The biggest change is {d['category']}: {d['current']} versus {d['previous']}."
    if r.get("search_financial_memory", {}).get("results"):
        text += " I also checked your past monthly summaries for context."
    return text


def compose_afford(question: str, r: dict[str, dict[str, Any]]) -> str:
    a = r["calculate_affordability"]
    until = _d(a["safe_to_spend_until"])
    lead = {
        "fits": f"It fits. You have {a['safe_to_spend_before']} safe to spend until {until}, and "
                f"{a['safe_to_spend_after']} after the {a['purchase']} purchase.",
        "stretch": f"It fits in your safe-to-spend of {a['safe_to_spend_before']}, but it's more than this week's share "
                   f"({a['left_this_week_before']}). You'd have {a['safe_to_spend_after']} left until {until}, "
                   f"about {a['per_day_after']} a day.",
        "over": f"It's {a['over_safe_to_spend_by']} more than your safe-to-spend of {a['safe_to_spend_before']}, so it would "
                f"come out of money set aside for bills, savings or your buffer.",
    }[a["check_verdict"]]
    text = (f"{lead} Looking further ahead, your spendable balance is projected to be about {a['projected_balance']} by "
            f"{_d(a['horizon_end'])}, compared with {a['without_change']} without it.")
    goal = a.get("goal_impact")
    if goal and goal.get("estimated_delay_days"):
        text += f" If it came out of savings, {goal['goal']} could be about {goal['estimated_delay_days']} days later."
    if a.get("budget_impact") and a["budget_impact"]["would_exceed"]:
        text += f" It would put {a['budget_impact']['category']} over budget."
    return text + " The projection is an estimate based on your scheduled bills and typical spending."


def compose_scenario(question: str, r: dict[str, dict[str, Any]]) -> str:
    s = r["simulate_scenario"]
    level = {"low": "low risk", "medium": "moderate risk", "high": "high risk"}[s["risk_level"]]
    return (f"With that change, your spendable balance is projected to be about {s['projected_balance']} by "
            f"{_d(s['horizon_end'])}, versus {s['without_change']} without it. Faldo rates this as {level}. "
            f"The likely range is {s['likely_range']['low']} to {s['likely_range']['high']}. This is an estimate.")


def compose_goal(question: str, r: dict[str, dict[str, Any]]) -> str:
    g = r["get_goal_progress"]
    if "error" in g:
        names = ", ".join(g.get("goals", [])) or "none yet"
        return f"I couldn't find that goal. Your goals: {names}."
    goals = g.get("goals", [])
    if not goals:
        return "You don't have any savings goals yet. Create one on the Goals page and I can project when you'll reach it."
    parts = []
    for goal in goals[:3]:
        text = f"{goal['goal']}: {goal['saved']} of {goal['target']} saved ({goal['pct_complete']:g}%)."
        if goal["projected_completion"]:
            text += f" At {goal['planned_monthly'] or goal['average_monthly_contribution']} a month, you'd reach it around {_d(goal['projected_completion'], '%B %Y')}."
        else:
            text += " There aren't enough contributions yet to project a date."
        if goal["required_monthly"] and goal["on_track"] is False:
            text += f" To hit your target date you'd need about {goal['required_monthly']} a month."
        parts.append(text)
    return " ".join(parts) + " Projections are estimates."


def compose_running_out(question: str, r: dict[str, dict[str, Any]]) -> str:
    parts = []
    c = r.get("compare_spending", {})
    if c.get("change_pct") is not None:
        parts.append(f"Spending so far is {c['current_total']} versus {c['previous_total']} at this point last month ({c['change_pct']:+g}%).")
        if c.get("biggest_changes"):
            d = c["biggest_changes"][0]
            parts.append(f"The biggest shift is {d['category']} ({d['current']} vs {d['previous']}).")
    rec = r.get("get_recurring_payments", {})
    if rec.get("monthly_total_outflows_minor"):
        parts.append(f"Recurring payments take about {rec['monthly_total_outflows']} a month.")
    up = r.get("get_upcoming_payments", {})
    if up.get("total_bills_minor"):
        parts.append(f"You have {up['total_bills']} in bills due in the next 30 days.")
    fc = r.get("calculate_forecast", {})
    if fc and "error" not in fc:
        parts.append(f"Your spendable balance is projected to reach its lowest point of about {fc['lowest_point']} around "
                     f"{_d(fc['lowest_point_date'])} (estimate).")
    notes = r.get("search_financial_memory", {}).get("results", [])
    if notes:
        parts.append(f"A note from your history may be related [{notes[0]['ref']}].")
    return " ".join(parts) or "I don't have enough data yet to explain your cash flow."


def compose_recurring(question: str, r: dict[str, dict[str, Any]]) -> str:
    rec = r["get_recurring_payments"]
    if not rec["payments"]:
        return "You don't have any matching recurring payments set up."
    names = ", ".join(f"{p['name']} ({p['amount']} {p['frequency'].replace('_', '-')})" for p in rec["payments"][:8])
    return (f"You have {rec['count']} active: {names}. Together they cost about {rec['monthly_total_outflows']} a month, "
            f"or {rec['yearly_total_outflows']} a year.")


def compose_upcoming(question: str, r: dict[str, dict[str, Any]]) -> str:
    up = r["get_upcoming_payments"]
    if not up["bills"]:
        return "No bills are scheduled in the next 30 days."
    first = ", ".join(f"{b['name']} {b['amount']} on {_d(b['due_on'])}" for b in up["bills"][:5])
    text = f"You have {up['total_bills']} in bills due in the next 30 days: {first}."
    if up["expected_income"]:
        text += f" Expected income in the same window: {up['total_expected_income']}."
    return text


def compose_budget(question: str, r: dict[str, dict[str, Any]]) -> str:
    b = r["get_budget_status"]
    if not b.get("has_budget"):
        return f"You haven't set a budget for {b['month']} yet. You've spent {b['total_spent_this_month']} so far."
    risky = sorted([line for line in b["lines"] if line["status"] in {"over", "at_risk", "near_limit", "at_limit"}],
                   key=lambda line: -line["pct_used"])
    text = f"You've used {b['total_spent_in_budgeted_categories']} of {b['total_budgeted']} budgeted this month."
    if risky:
        text += " Watch " + "; ".join(
            f"{line['category']} ({line['spent']} of {line['limit']}, {line['pct_used']:g}%)" for line in risky[:3]) + "."
    else:
        text += " Every category is on track."
    return text


def compose_savings(question: str, r: dict[str, dict[str, Any]]) -> str:
    s = r["get_savings_summary"]
    if not s["full_months_counted"]:
        return "There isn't a full month of income and expenses yet to calculate savings."
    last = next(m for m in reversed(s["months"]) if not m["partial_month"])
    rate = f" ({s['average_savings_rate_pct']:g}% of income)" if s["average_savings_rate_pct"] is not None else ""
    return (f"Over the last {s['full_months_counted']} full months you saved an average of {s['average_net_saved_full_months']} "
            f"a month{rate}. In {_d(last['month'] + '-01', '%B')} you earned {last['income']}, spent {last['expenses']} and kept {last['net_saved']}.")


def compose_reduce(question: str, r: dict[str, dict[str, Any]]) -> str:
    cats = [c for c in r.get("get_category_spending", {}).get("categories", []) if not c.get("essential")]
    parts = []
    if cats:
        parts.append("Your largest flexible categories this month are " +
                     ", ".join(f"{c['category']} ({c['amount']})" for c in cats[:3]) + ".")
    risky = sorted([line for line in r.get("get_budget_status", {}).get("lines", []) if line["status"] in {"over", "at_risk"}],
                   key=lambda line: -line["pct_used"])
    if risky:
        parts.append("Over or at risk: " + ", ".join(f"{line['category']} ({line['pct_used']:g}% used)" for line in risky[:3]) + ".")
    grew = [d for d in r.get("compare_spending", {}).get("biggest_changes", []) if d["change_minor"] > 0]
    if grew:
        parts.append(f"{grew[0]['category']} grew the most versus last month ({grew[0]['change']}).")
    subs = r.get("get_recurring_payments", {})
    if subs.get("count"):
        parts.append(f"Subscriptions cost {subs['monthly_total_outflows']} a month — worth reviewing ones you rarely use.")
    return " ".join(parts) or "I need more spending data to suggest where to cut back."


def compose_balance(question: str, r: dict[str, dict[str, Any]]) -> str:
    b = r["get_current_balance"]
    accounts = ", ".join(f"{a['name']} {a['balance']}" for a in b["accounts"][:6])
    until = date.fromisoformat(b["safe_to_spend_until"]).strftime("%b %-d")
    window = f"until {until}" if b["safe_to_spend_period"] == "until next income" else "over the next 30 days"
    return (f"Your total balance is {b['total_balance']} ({accounts}). Spendable money is {b['spendable_balance']}. After "
            f"setting aside bills, planned savings, money you owe, your card balance and your buffer, {b['safe_to_spend']} "
            f"is safe to spend {window} (≈ {b['safe_to_spend_per_day']} a day), with {b['left_this_week']} left for this "
            f"week. Income you haven't received yet isn't counted.")


def compose_income(question: str, r: dict[str, dict[str, Any]]) -> str:
    i = r["get_monthly_income"]
    if not i["total_minor"]:
        return "No income is recorded for this month yet."
    top = ", ".join(f"{c['category']} {c['amount']}" for c in i["by_category"][:3])
    return f"You've received {i['total_income']} this month ({top})."


def compose_forecast(question: str, r: dict[str, dict[str, Any]]) -> str:
    f = r["calculate_forecast"]
    if f["data_sufficiency"] == "insufficient":
        return "I need at least a week of transactions before I can project your balance."
    return (f"Your spendable balance is {f['current_spendable_balance']} now and is projected to be about "
            f"{f['projected_end_balance']} on {_d(f['horizon_end'])}, likely between {f['likely_range_low']} and "
            f"{f['likely_range_high']}. That includes {f['expected_income']} expected income and {f['scheduled_outflows']} "
            "in scheduled payments. This is an estimate, not a guarantee.")


def compose_debts(question: str, r: dict[str, dict[str, Any]]) -> str:
    d = r["get_debts"]
    return f"You owe {d['total_i_owe']} in total, and others owe you {d['total_owed_to_me']}."


def compose_health(question: str, r: dict[str, dict[str, Any]]) -> str:
    h = r["get_financial_health"]
    if h["score"] is None:
        return "There isn't enough history yet for a financial health score (it needs about 60 days of data)."
    counted = [c for c in h["components"] if c["counted"]]
    weakest = min(counted, key=lambda c: c["score"])
    strongest = max(counted, key=lambda c: c["score"])
    return (f"Your Faldo health score is {h['score']} ({h['label']}). Strongest factor: {strongest['label']} "
            f"({strongest['score']}). Most room to improve: {weakest['label']} ({weakest['score']}). "
            "It's a transparent summary of your habits, not a professional assessment.")


def compose_insights(question: str, r: dict[str, dict[str, Any]]) -> str:
    items = r["get_insights"]["insights"]
    if not items:
        return "Nothing unusual right now."
    return " ".join(f"{i['title']}: {i['detail']}" for i in items[:3])


def compose_transactions(question: str, r: dict[str, dict[str, Any]]) -> str:
    t = r["get_transactions"]
    if not t["match_count"]:
        return "No transactions match that."
    rows = t["transactions"][:5]
    listed = "; ".join(f"{_d(x['date'])} {x['merchant'] or x['category']} {x['amount']} [{x['ref']}]" for x in rows)
    return f"I found {t['match_count']} transactions in {t['period']['label']}. Most recent: {listed}."


def compose_memory(question: str, r: dict[str, dict[str, Any]]) -> str:
    results = r.get("search_financial_memory", {}).get("results", [])
    if not results:
        return ("I couldn't find anything in your Faldo data about that. Try asking about spending, budgets, goals, "
                "bills or a specific purchase.")
    lines = []
    for item in results[:5]:
        first = item["text"].split("\n")
        detail = next((x for x in first[1:] if x.startswith(("Merchant:", "Note:", "Items:"))), "")
        if item["kind"] == "financial_note" and len(first) > 1:
            detail = "Note: " + first[1][:90]
        label = item.get("item_name") or detail.split(":", 1)[-1].strip() or first[0].split("] ", 1)[-1]
        lines.append(f"{label} ({_d(item['date'], '%b %-d, %Y')}) [{item['ref']}]" if item.get("date") else f"{label} [{item['ref']}]")
    return ("These records from your history look related: " + "; ".join(lines) +
            ". I haven't added anything up; ask “how much did I spend on …” for an exact total.")


COMPOSERS = {
    "where": compose_where,
    "topic": compose_topic,
    "compare": compose_compare,
    "afford": compose_afford,
    "scenario": compose_scenario,
    "goal": compose_goal,
    "running_out": compose_running_out,
    "recurring": compose_recurring,
    "upcoming": compose_upcoming,
    "budget": compose_budget,
    "savings": compose_savings,
    "reduce": compose_reduce,
    "balance": compose_balance,
    "income": compose_income,
    "forecast": compose_forecast,
    "debts": compose_debts,
    "health": compose_health,
    "insights": compose_insights,
    "transactions": compose_transactions,
    "memory": compose_memory,
}
