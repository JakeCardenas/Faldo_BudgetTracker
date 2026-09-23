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

# Plans to buy something later, in English or Taglish: "plano ko bumili ng iPhone 18 Pro in 2028 July, magkano ipon ko?"
MONTHS = {
    "january": 1, "jan": 1, "enero": 1, "february": 2, "feb": 2, "pebrero": 2, "march": 3, "mar": 3, "marso": 3,
    "april": 4, "apr": 4, "abril": 4, "may": 5, "mayo": 5, "june": 6, "jun": 6, "hunyo": 6, "july": 7, "jul": 7,
    "hulyo": 7, "august": 8, "aug": 8, "agosto": 8, "september": 9, "sept": 9, "sep": 9, "setyembre": 9,
    "october": 10, "oct": 10, "oktubre": 10, "november": 11, "nov": 11, "nobyembre": 11, "december": 12, "dec": 12,
    "disyembre": 12,
}
_MONTH = "|".join(sorted(MONTHS, key=len, reverse=True))
YEAR_MONTH_RE = re.compile(rf"\b(20\d{{2}})\s+({_MONTH})\b", re.IGNORECASE)
MONTH_YEAR_RE = re.compile(rf"\b({_MONTH})\.?(?:\s*(?:of\s+|,\s*)?(20\d{{2}}))?\b", re.IGNORECASE)
YEAR_RE = re.compile(r"\b(?:in|by|sa|before|until|bago|pagdating ng|this)\s+(20\d{2})\b", re.IGNORECASE)
IN_MONTHS_RE = re.compile(r"\b(?:in|within|after|sa loob ng|pagkatapos ng)\s+(\d{1,3})\s+(?:months?|buwan)\b"
                          r"|\b(\d{1,3})\s+(?:months?|buwan)\s+(?:from now|mula ngayon)\b", re.IGNORECASE)
PURCHASE_RE = re.compile(
    r"(?:buy|get(?=\s+(?:a|an|new|the|isang|bagong)\b)|afford|purchase|save up for|saving up for|save for|saving for|bumili ng|bibili ng|makabili ng|mabili ang|"
    r"mabili yung|bilhin ang|bilhin yung|pambili ng|ipon para sa|mag-?ipon para sa|mag-?ipon ng pambili ng)\s+"
    r"(?:(?:my|the|a|an|new|bagong|ng|yung|ang|isang)\s+)*(.+?)"
    r"(?=\s+(?:in|by|on|sa|para|before|next|this|within|kapag|pag|when|at|for|worth|costing|that|na|nagkakahalaga|"
    r"around|about|mga)\b|,(?!\d)|\.(?!\d)|[?!]|$)",
    re.IGNORECASE,
)
FUTURE_WORDS = re.compile(r"\b(plano|plan(?:ning)? to|balak|gusto kong|i want to|want to|magkano (?:ang )?(?:ipon|dapat)|"
                          r"how much (?:should|do|would) i (?:need to )?save|save up|save for|saving for|mag-?ipon|when (?:can|will|could) i)\b",
                          re.IGNORECASE)
GENERIC_ITEMS = {"it", "this", "that", "goal", "my goal", "goals", "one", "things", "stuff"}
PAST_RE = re.compile(r"\b(did|bought|spent|was|were|last|nung|noong|binili ko|nabili ko)\b", re.IGNORECASE)


# Requests for ideas ("suggest ka nga ng gift ideas para sa tito ko, 5k budget"): Faldo suggests, never logs.
IDEAS_RE = re.compile(
    r"\b(suggest|recommend|ideas?|mag-?suggest|pa-?suggest|i-?suggest|gift|gifts|regalo|iregalo|ireregalo|pasalubong|"
    r"pwedeng bilhin|puwedeng bilhin|what (?:should|can|could) i (?:buy|get)|ano(?:ng)? (?:magandang|pwede|puwede|bibilhin|"
    r"bilhin|bilhin ko))\b",
    re.IGNORECASE,
)
RECEIVED_RE = re.compile(r"\b(nagbigay|binigyan|bigay|gave me|received|natanggap|got \S+ from|pamasko|aguinaldo)\b", re.IGNORECASE)
RECIPIENTS: list[tuple[str, str, set[str]]] = [
    (r"\b(tito|uncle|ninong)\b", "your tito", {"male", "any"}),
    (r"\b(tita|auntie|aunt|ninang)\b", "your tita", {"female", "any"}),
    (r"\b(mama|mom|mommy|nanay|inay|mother)\b", "your mom", {"female", "any"}),
    (r"\b(papa|dad|daddy|tatay|itay|father)\b", "your dad", {"male", "any"}),
    (r"\b(lola|grandma|lolo|grandpa)\b", "your grandparent", {"elder"}),
    (r"\b(kuya|brother)\b", "your kuya", {"male", "any"}),
    (r"\b(ate|sister)\b", "your ate", {"female", "any"}),
    (r"\b(girlfriend|gf|wife)\b", "her", {"female", "any"}),
    (r"\b(boyfriend|bf|husband)\b", "him", {"male", "any"}),
    (r"\b(jowa|partner|asawa)\b", "your partner", {"any", "friend"}),
    (r"\b(inaanak|pamangkin|godchild|kid|kids|child|baby)\b", "the kid", {"kid"}),
    (r"\b(friend|kaibigan|barkada|bestfriend|bff)\b", "your friend", {"friend", "any"}),
    (r"\b(boss|coworker|officemate|katrabaho|teacher|guro|prof)\b", "them", {"work"}),
]
# Rough typical prices in the Philippines, in pesos; always shown as estimates.
IDEA_CATALOGUE: list[tuple[str, str, int, int, set[str]]] = [
    ("Men's perfume", "A classic that always feels special; pick a fresh everyday scent.", 1500, 4500, {"male"}),
    ("Women's perfume", "A signature scent she can wear every day.", 1500, 4500, {"female"}),
    ("Wristwatch", "Useful every day; a simple analog or digital one goes with everything.", 2000, 6000, {"male", "female", "self"}),
    ("Simple jewelry", "A necklace or bracelet she can wear every day.", 1500, 5000, {"female"}),
    ("Handbag or tote", "Something she'll use daily.", 1500, 5000, {"female"}),
    ("Leather wallet", "Practical and lasts for years.", 800, 2500, {"male", "self"}),
    ("Polo shirt", "Easy to wear to work or family gatherings.", 700, 2000, {"male"}),
    ("Grooming kit", "A shaver or trimmer set for everyday use.", 800, 2500, {"male"}),
    ("Skincare set", "A treat she might not buy for herself.", 800, 3000, {"female", "self"}),
    ("Air fryer", "A kitchen upgrade the whole family will use.", 2500, 5000, {"female"}),
    ("Foot or neck massager", "Comfort after a long day.", 1500, 4500, {"elder", "male", "female"}),
    ("Blood pressure monitor", "Thoughtful and practical for health at home.", 1500, 3500, {"elder"}),
    ("Comfortable house slippers", "Simple comfort they'll use every day.", 500, 1500, {"elder"}),
    ("Photo album or frame", "Family photos never get old.", 500, 1500, {"elder", "female"}),
    ("Bluetooth speaker", "Great for music and videoke nights.", 1200, 4000, {"male", "friend", "self", "any"}),
    ("Wireless earbuds", "Handy for commutes and calls.", 1000, 4000, {"friend", "self", "any"}),
    ("Power bank", "Never runs out of battery on the go.", 800, 2000, {"friend", "self", "male"}),
    ("Coffee gift set", "Local beans or a sampler for the coffee lover.", 600, 2000, {"male", "female", "elder", "work", "any"}),
    ("Nice bottle of wine", "Good for celebrations and family dinners.", 800, 3000, {"male", "female"}),
    ("Dinner treat together", "Treat them to a meal; the time together counts most.", 1000, 3000, {"friend", "elder", "any"}),
    ("Insulated tumbler", "Keeps drinks cold all day at work or school.", 800, 2500, {"friend", "work", "self", "any"}),
    ("Board or card game", "Something fun to enjoy together.", 800, 2500, {"friend", "kid"}),
    ("Toy or building set", "Fun that lasts beyond the holidays.", 800, 3000, {"kid"}),
    ("Books", "Picture books or a series they'll love.", 300, 1500, {"kid"}),
    ("School bag", "Useful for the next school year.", 800, 2000, {"kid"}),
    ("Art set", "Crayons, paints and sketch pads for creative kids.", 400, 1200, {"kid"}),
    ("Desk plant", "A small, low-care plant for their desk.", 300, 1200, {"work"}),
    ("Planner or notebook set", "Always handy at work.", 500, 1500, {"work"}),
    ("Running shoes", "Good shoes pay off if you walk or run a lot.", 2500, 6000, {"self"}),
    ("Durable backpack", "One good bag for work, school or travel.", 1500, 4000, {"self"}),
    ("Online course", "Learn a skill that can help you earn more.", 500, 3000, {"self"}),
]


def _ideas(question: str) -> dict[str, Any]:
    """Ideas from the catalogue for whoever it's for, within the budget when there is one."""
    whom, audience = None, {"self"}
    # "Nagbigay ng ₱10k yung ninong ko": the ninong gave the money, so only "para sa …" / "for …" names who it's for.
    target = question
    if RECEIVED_RE.search(question):
        marked = re.search(r"\b(?:para sa|para kay|for|kay)\s+(.*)", question, re.IGNORECASE)
        target = marked.group(1) if marked else ""
    for pattern, label, tags in RECIPIENTS:
        if re.search(pattern, target, re.IGNORECASE):
            whom, audience = label, tags
            break
    gift = bool(re.search(r"\b(gift|gifts|regalo|iregalo|ireregalo|pasalubong|para sa)\b", question, re.IGNORECASE))
    if whom is None and gift:
        audience = {"any"}
    budget = _amount(question)
    pool = [i for i in IDEA_CATALOGUE if i[4] & audience]
    if budget:
        fitting = sorted([i for i in pool if i[3] <= budget], key=lambda i: -i[3])
        stretch = [i for i in pool if i[2] <= budget < i[3]]
        chosen = (fitting + stretch)[:5]
    else:
        chosen = pool[:5]
    topic = f"Gift ideas for {whom}" if whom else ("Gift ideas" if gift else "Ideas for your money")
    ideas = [{"name": n, "why": why, "price_low": low, "price_high": high,
              "category": "Gifts & Family" if whom or gift else "Shopping"} for n, why, low, high, _ in chosen]
    return {"topic": topic, "budget": budget, "ideas": ideas}


# "Can I afford it?", in English and Taglish.
AFFORD_RE = re.compile(r"\bafford\b|can i (buy|get)|should i (buy|get)|\bkaya (ko|ba|kaya)\b|kakayanin|\bafford ko\b|"
                       r"mabibili ko ba|mabili ko ba|kaya ng budget|pasok (ba )?sa budget", re.IGNORECASE)
REMEMBER_RE = re.compile(r"^(?:please\s+)?(?:remember|tandaan(?: mo)?)(?:\s+(?:that|na))?[:,]?\s+(.+)$", re.IGNORECASE)
CHALLENGE_RE = re.compile(r"\bchallenge\b|\bipon challenge\b|\bno[- ]spend\b", re.IGNORECASE)
GOAL_ACTION_RE = re.compile(r"\b(?:make|create|set up|start|gawa(?:n|in)?)\b.*\bgoal\b|\bmake it a goal\b", re.IGNORECASE)
BUDGET_ACTION_RE = re.compile(r"\bset\b.*\bbudget\b.*?\b(?:for|sa|ng)\s+([a-z &]+?)\s+(?:to|at|of|na|sa)\b", re.IGNORECASE)


def _challenge(question: str) -> dict[str, Any]:
    q = question.lower()
    days = re.search(r"(\d{1,3})\s*(?:days?|araw)", q)
    amount = _amount(re.sub(r"\b52[- ]?weeks?\b|\b\d{1,3}\s*(?:days?|araw)\b", " ", question, flags=re.IGNORECASE))
    on = re.search(r"\b(?:on|sa|for)\s+([a-z][a-z &]{2,30}?)(?=\s+(?:for|in|this|sa)\b|[,.!?]|$)", question, re.IGNORECASE)
    category = on.group(1).strip() if on else _topic(question)
    if re.search(r"\b52\b", q):
        return {"action": "start_challenge", "challenge": "ipon_52", "amount": amount or 20}
    if re.search(r"no[- ]spend", q):
        return {"action": "start_challenge", "challenge": "no_spend", "days": int(days.group(1)) if days else 7, "category": category}
    if re.search(r"\b(cap|limit|hanggang)\b", q) and amount:
        return {"action": "start_challenge", "challenge": "spend_cap", "amount": amount, "days": int(days.group(1)) if days else 30,
                "category": category}
    return {"action": "start_challenge", "challenge": "ipon_daily", "amount": amount or 50, "days": int(days.group(1)) if days else 30}


def _action_args(**given: Any) -> dict[str, Any]:
    base = {"action": None, "name": None, "amount": None, "category": None, "date": None, "transaction_type": None,
            "account": None, "monthly_amount": None, "fact": None, "challenge": None, "days": None}
    return {**base, **given}


def _when(text: str, today: date) -> tuple[str | None, int | None, str]:
    """A target month from the text (as YYYY-MM-01) or a number of months, and the text without it."""
    match = IN_MONTHS_RE.search(text)
    if match:
        return None, int(match.group(1) or match.group(2)), text[:match.start()] + " " + text[match.end():]
    if re.search(r"\bnext year\b|\bsa susunod na taon\b", text, re.IGNORECASE):
        return None, 12, text
    found: tuple[int, int | None, re.Match[str]] | None = None
    match = YEAR_MONTH_RE.search(text)
    if match:
        found = (MONTHS[match.group(2).lower()], int(match.group(1)), match)
    else:
        for match in MONTH_YEAR_RE.finditer(text):
            if match.group(1).lower() == "may" and not match.group(2):
                continue  # "may" is also everyday Filipino ("may ipon ba ako?")
            found = (MONTHS[match.group(1).lower()], int(match.group(2)) if match.group(2) else None, match)
            break
    if found:
        month, year, match = found
        if year is None:
            year = today.year if month > today.month else today.year + 1
        return f"{year}-{month:02d}-01", None, text[:match.start()] + " " + text[match.end():]
    match = YEAR_RE.search(text)
    if match:
        year = int(match.group(1))
        return f"{year}-{12 if year == today.year else 1:02d}-01", None, text[:match.start()] + " " + text[match.end():]
    return None, None, text


def _purchase(question: str, today: date) -> dict[str, Any] | None:
    """Item, price and timing for a plan to buy something later; None when the question isn't one."""
    if PAST_RE.search(question):
        return None
    target, months, rest = _when(question, today)
    item_match = PURCHASE_RE.search(rest)
    if not item_match:
        return None
    item = re.sub(r"^(?:₱|php)?\s?\d[\d,]*(?:\.\d+)?\s?k?\s+", "", item_match.group(1).strip(), flags=re.IGNORECASE)
    item = re.split(r"\s+(?:₱|php\b)|\s+\d{1,3}(?:,\d{3})+|\s+\d+(?:\.\d+)?k\b|\s+\d{4,}", item,
                    flags=re.IGNORECASE)[0].strip(" '\"")
    if not item or item.lower() in GENERIC_ITEMS or len(item) > 40 or item.split()[0].lower() in {"in", "on", "at", "sa", "by"}:
        return None
    has_time = target is not None or months is not None
    if not (has_time or FUTURE_WORDS.search(question)):
        return None
    price = None
    for match in AMOUNT_RE.finditer(rest.replace(item, " ", 1)):
        whole = match.group(1).replace(",", "")
        value = float(f"{whole}.{match.group(2) or '0'}") * (1000 if match.group(3) else 1)
        if re.search(r"₱|php", match.group(0), re.IGNORECASE) or match.group(3) or "," in match.group(1) or value >= 1000:
            price = value
            break
    return {"item": item, "price": price, "price_is_estimate": False, "target_date": target, "months_from_now": months}


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


def _call(tool: str, /, **arguments: Any) -> ToolCall:
    return ToolCall(id=f"local_{tool}", name=tool, arguments=arguments)


def plan(question: str, today: date | None = None) -> tuple[str, list[ToolCall]]:
    q = question.lower()
    period = _period(q)
    topic = _topic(question)
    remembered = REMEMBER_RE.match(question.strip())
    if remembered:
        return "action", [_call("propose_action", **_action_args(action="remember", fact=remembered.group(1).strip()))]
    if CHALLENGE_RE.search(question):
        if re.search(r"\b(how|progress|status|kamusta|kumusta|my challenges?)\b", q) and not re.search(r"\b(start|new|another|suggest)\b", q):
            return "challenges", [_call("get_challenges")]
        return "action", [_call("propose_action", **_action_args(**_challenge(question)))]
    budget = BUDGET_ACTION_RE.search(question)
    if budget and _amount(question):
        return "action", [_call("propose_action", **_action_args(action="set_budget", category=budget.group(1).strip(),
                                                                 amount=_amount(question)))]
    if IDEAS_RE.search(question):
        return "ideas", [_call("suggest_ideas", **_ideas(question))]
    purchase = _purchase(question, today or date.today())
    if GOAL_ACTION_RE.search(question):
        target, _, rest = _when(question, today or date.today())
        named = re.search(r"(?:\bgoal\s*[:\-–]|\b(?:for|para sa))\s*(?:my |the |a |an )?(.+?)(?=\s+(?:worth|of|for|by|in|sa|na)\b|"
                          r"[,.!?]|\s+(?:₱|php)|\s+\d+(?:\.\d+)?\s*k\b|\s+\d{1,3}(?:,\d{3})+|\s+\d{4,}|$)", rest, re.IGNORECASE)
        item = (purchase or {}).get("item") or (named.group(1).strip() if named else None)
        amount = (purchase or {}).get("price") or _amount(re.sub(r"\b20\d\d\b", " ", rest))
        if item and amount:
            return "action", [_call("propose_action", **_action_args(
                action="create_goal", name=item, amount=amount, date=(purchase or {}).get("target_date") or target))]
    if purchase and (purchase["price"] or purchase["target_date"] or purchase["months_from_now"]):
        return "future_purchase", [_call("plan_future_purchase", **purchase)]
    amount = _amount(question)

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
    if AFFORD_RE.search(q):
        # Dates aren't prices: "kaya ko ba ₱4,496 sa birthday ko october 14?" is about ₱4,496.
        _, _, undated = _when(question, today or date.today())
        price = _amount(re.sub(r"\b20\d\d\b", " ", undated))
        if price:
            return "afford", [_call("calculate_affordability", amount=price, description=None, category=None, date=None)]
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
    if re.search(r"joy money|money plan|spending plan|\bwants\b", q):
        return "money_plan", [_call("get_money_plan")]
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
    if purchase:
        return "goal", [_call("get_goal_progress", goal_name=purchase["item"])]
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

        stated = re.search(r"Today is (\d{4}-\d{2}-\d{2})", system)
        today = date.fromisoformat(stated.group(1)) if stated else date.today()
        intent, calls = plan(question, today)
        photo = bool(transcript[last_user].images)
        if photo and not results and intent in {"goal", "memory"}:
            # Basic mode can't read the price off a photo; asking beats searching old records for the wrong thing.
            return ModelTurn(text="I can't read photos in basic mode. Type the price in your message and I'll check it "
                                  "against your Safe to Spend.")
        pending = [c for c in calls if c.name not in results]
        if pending:
            return ModelTurn(text=None, tool_calls=pending)

        # "When can I afford my MacBook?" with no MacBook goal: plan it as a future purchase instead.
        goal = results.get("get_goal_progress", {})
        if intent == "goal" and "error" in goal and "plan_future_purchase" not in results:
            purchase = _purchase(question, today)
            if purchase:
                return ModelTurn(text=None, tool_calls=[_call("plan_future_purchase", **purchase)])
        if "plan_future_purchase" in results:
            intent = "future_purchase"

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


def compose_action(question: str, r: dict[str, dict[str, Any]]) -> str:
    a = r["propose_action"]
    if "error" in a:
        return a["error"].replace("Ask ", "Tell me ", 1) if a["error"].startswith("Ask ") else a["error"]
    lead = {"remember": "Got it. Want me to remember this?", "start_challenge": "Let's do it. Here's your challenge.",
            "create_goal": "Here's the goal, ready to go.", "set_budget": "Here's the new budget."}.get(a["proposed"], "Here's what I'll do.")
    return f"{lead} Tap the button on the card if it looks right; nothing changes until you do."


def compose_challenges(question: str, r: dict[str, dict[str, Any]]) -> str:
    items = r["get_challenges"].get("challenges", [])
    if not items:
        return "You don't have a challenge yet. Want to start one? A daily ipon or a no-spend week is a good first try."
    parts = []
    for c in items[:3]:
        state = {"completed": "Done!", "missed": "This one slipped.", "active": "On track." if c["on_track"] else "A bit behind."}[c["state"]]
        parts.append(f"{c['title']}: {c['summary']}. {state}" + (f" Next: {c['next_step']}." if c.get("next_step") else ""))
    return " ".join(parts)


def compose_ideas(question: str, r: dict[str, dict[str, Any]]) -> str:
    s = r["suggest_ideas"]
    if not s.get("ideas"):
        return "I couldn't find ideas that fit that budget. Try a bigger budget or tell me more about who it's for."
    topic = s["topic"][0].lower() + s["topic"][1:]
    text = f"Here are some {topic}" + (f" within {s['budget']}." if s.get("budget") else ".")
    if s.get("budget_fits_safe_to_spend") is False:
        text += (f" Heads up: your Safe to Spend is {s['safe_to_spend']} right now, so spending {s['budget']} would dip into "
                 "money set aside for bills and savings.")
    elif s.get("budget_fits_safe_to_spend"):
        text += f" Your Safe to Spend is {s['safe_to_spend']}, so this fits."
    if RECEIVED_RE.search(question):
        text += " Since it's gift money, log it as income first so Faldo counts it, and consider saving part of it."
    return text + " Tap Plan it to save an idea for later, or Log it after you buy. Prices are rough estimates."


def compose_future_purchase(question: str, r: dict[str, dict[str, Any]]) -> str:
    p = r["plan_future_purchase"]
    if "error" in p:
        return f"I couldn't plan that: {p['error']}"
    item = p["item"]
    usual = p.get("usual_monthly_surplus")
    saves = usual and (p.get("usual_monthly_surplus_minor") or 0) > 0
    pace = (f" You usually save about {usual} a month." if saves else
            f" Lately you've spent about {p['usual_monthly_overspend']} a month more than you earn."
            if p.get("usual_monthly_overspend") else "")
    if p.get("needs_price"):
        when = f" You have {_plural(p['months_left'], 'month')} until {_d(p['target_date'], '%B %Y')}." if p.get("months_left") else ""
        return (f"How much is the {item}? Tell me its price and I'll work out how much to save each month and week, "
                f"and when you'd have it.{when}{pace}")
    if not p["still_needed_minor"]:
        return f"You've already saved the {p['price']} for the {item}{' in ' + p['matching_goal'] if p.get('matching_goal') else ''}."
    saved = f" You've saved {p['saved_so_far']} in {p['matching_goal']}, so {p['still_needed']} to go." if p.get("saved_so_far_minor") else ""
    lead = f"The {item} is {p['price']}.{saved}"
    if p.get("save_per_month"):
        text = (f"{lead} To have it by {_d(p['target_date'], '%B %Y')}, save about {p['save_per_month']} a month "
                f"({p['save_per_week']} a week) for the next {_plural(p['months_left'], 'month')}.{pace}")
        if p.get("share_of_usual_surplus_pct"):
            share = p["share_of_usual_surplus_pct"]
            text += (f" That's {share}% of what you usually save." if share <= 100 else
                     " That's more than you usually save, so you'd need to cut spending or push the date back.")
    else:
        text = lead + pace
    if p.get("ready_at_current_pace"):
        text += f" At your current pace you'd have it around {_d(p['ready_at_current_pace'], '%B %Y')}."
    elif not saves:
        text += " Once you save a little each month, I can predict when you'll have it."
    return text + " Tip: make it a goal in Faldo to track it. These are estimates based on your recent months."


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


def compose_money_plan(question: str, r: dict[str, dict[str, Any]]) -> str:
    m = r["get_money_plan"]
    if not m.get("configured"):
        return "You don't have a money plan yet. Set one on Plan > Money plan to give each payday a job, including Joy Money for wants."
    return (f"Your Joy Money is {m['joy_money_this_period']} for this pay period ({m['period']}). You've spent "
            f"{m['joy_money_spent_this_period']} of it, so {m['joy_money_left_this_period']} is left, with "
            f"{m['joy_money_left_this_week']} of that for this week. For needs, {m['needs_left_this_week']} is left this week.")


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
    "future_purchase": compose_future_purchase,
    "ideas": compose_ideas,
    "action": compose_action,
    "challenges": compose_challenges,
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
    "money_plan": compose_money_plan,
    "health": compose_health,
    "insights": compose_insights,
    "transactions": compose_transactions,
    "memory": compose_memory,
}
