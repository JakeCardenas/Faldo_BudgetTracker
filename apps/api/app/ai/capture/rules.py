import re
from datetime import date, timedelta
from typing import Any

from app.ai.providers.base import CaptureContext

AMOUNT_RE = re.compile(
    r"(?<![\w.])(?:(?:₱|php|p)\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(k)?(?![\w/])",
    re.IGNORECASE,
)
CURRENCY_HINT_RE = re.compile(r"(₱|php|\bp(?=\d))", re.IGNORECASE)

MERCHANTS: list[tuple[str, str, str, str | None, list[str]]] = [
    (r"grab\s?food|foodpanda", "GrabFood", "Food & Dining", "Food delivery", []),
    (r"grab\s?car|\bgrab\b", "Grab", "Transportation", "Ride-hailing", ["Food & Dining"]),
    (r"angkas|joyride|move\s?it", "Angkas", "Transportation", "Ride-hailing", []),
    (r"jollibee|jolibee", "Jollibee", "Food & Dining", "Fast food", []),
    (r"mcdo|mcdonald'?s", "McDonald's", "Food & Dining", "Fast food", []),
    (r"chowking", "Chowking", "Food & Dining", "Fast food", []),
    (r"mang inasal", "Mang Inasal", "Food & Dining", "Fast food", []),
    (r"kfc", "KFC", "Food & Dining", "Fast food", []),
    (r"starbucks|sbux", "Starbucks", "Food & Dining", "Coffee", []),
    (r"tim hortons", "Tim Hortons", "Food & Dining", "Coffee", []),
    (r"7-?eleven|7/11|seven eleven", "7-Eleven", "Food & Dining", None, ["Groceries"]),
    (r"\bsm\b|sm supermarket|savemore", "SM Supermarket", "Groceries", None, ["Shopping"]),
    (r"puregold", "Puregold", "Groceries", None, []),
    (r"robinsons supermarket|landers|s&r", "Robinsons Supermarket", "Groceries", None, []),
    (r"shopee", "Shopee", "Shopping", None, []),
    (r"lazada", "Lazada", "Shopping", None, []),
    (r"uniqlo", "Uniqlo", "Shopping", "Clothing", []),
    (r"\bh&m\b", "H&M", "Shopping", "Clothing", []),
    (r"nike", "Nike", "Shopping", "Shoes", []),
    (r"adidas", "Adidas", "Shopping", "Shoes", []),
    (r"meralco", "Meralco", "Bills & Utilities", "Electricity", []),
    (r"maynilad|manila water", "Maynilad", "Bills & Utilities", "Water", []),
    (r"pldt|converge|globe at home|sky ?fiber", "PLDT", "Bills & Utilities", "Internet", []),
    (r"netflix", "Netflix", "Subscriptions", None, []),
    (r"spotify", "Spotify", "Subscriptions", None, []),
    (r"youtube premium|disney\+?|icloud|chatgpt|hbo", "Subscription", "Subscriptions", None, []),
    (r"mercury drug|watsons|southstar|rose pharmacy", "Mercury Drug", "Health", "Pharmacy", []),
    (r"petron|shell|caltex|seaoil", "Petron", "Transportation", "Fuel", []),
]

KEYWORD_CATEGORIES: list[tuple[str, str, str | None]] = [
    (r"electric(ity)?|kuryente", "Bills & Utilities", "Electricity"),
    (r"\bwater bill\b|\btubig\b", "Bills & Utilities", "Water"),
    (r"internet|wifi|broadband", "Bills & Utilities", "Internet"),
    (r"\bload\b|prepaid|gomo", "Bills & Utilities", "Mobile load"),
    (r"\brent\b|upa", "Housing", "Rent"),
    (r"grocer", "Groceries", None),
    (r"coffee|kape|latte", "Food & Dining", "Coffee"),
    (r"lunch|dinner|breakfast|merienda|food|meal|snack|pagkain|ulam", "Food & Dining", "Restaurants"),
    (r"taxi|jeep|jeepney|mrt|lrt|bus|pamasahe|fare|tricycle|commute", "Transportation", "Public transit"),
    (r"parking", "Transportation", "Parking"),
    (r"\bgas\b|fuel|gasolina", "Transportation", "Fuel"),
    (r"movie|cinema|concert|ticket", "Entertainment", "Events"),
    (r"medicine|gamot|pharmacy|vitamins", "Health", "Pharmacy"),
    (r"doctor|clinic|hospital|check-?up|dentist", "Health", "Medical"),
    (r"tuition|school|books|seminar|course", "Education", None),
    (r"haircut|salon|barber|spa|skincare", "Personal Care", None),
    (r"gift|regalo|birthday", "Gifts & Family", None),
    (r"shoes|sneakers|sapatos", "Shopping", "Shoes"),
    (r"shirt|clothes|pants|dress|jacket|damit|socks", "Shopping", "Clothing"),
    (r"phone|laptop|headphones|earbuds|charger|tablet|macbook|ipad", "Shopping", "Electronics"),
    (r"flight|hotel|airbnb|travel|trip", "Travel", None),
    (r"bank fee|service fee|atm fee|charge", "Fees & Charges", None),
]

INCOME_RE = re.compile(r"\b(salary|sweldo|payroll|paycheck|got paid|received|income|freelance|commission|bonus|"
                       r"allowance|13th month|refund|cashback|sold)\b", re.IGNORECASE)
TRANSFER_RE = re.compile(r"\b(transfer(red)?|moved|cash[- ]?in|top[- ]?up|sent .* to my|deposit(ed)? to)\b", re.IGNORECASE)
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
ACCOUNT_ALIASES = {
    "gcash": ["gcash", "g-cash"],
    "maya": ["maya", "paymaya"],
    "cash": ["cash", "wallet", "pitaka"],
    "bpi": ["bpi"],
    "bdo": ["bdo"],
    "unionbank": ["unionbank", "ub"],
    "credit": ["credit card", "visa", "mastercard", "cc"],
    "savings": ["savings", "digital bank", "gotyme", "seabank", "cimb", "tonik"],
}


def _amounts(text: str) -> list[tuple[int, int, float, bool]]:
    found = []
    for match in AMOUNT_RE.finditer(text):
        whole = match.group(1).replace(",", "")
        value = float(f"{whole}.{match.group(2) or '0'}")
        if match.group(3):
            value *= 1000
        prefix = text[max(0, match.start() - 4):match.start() + 1]
        explicit = bool(CURRENCY_HINT_RE.search(match.group(0)) or match.group(3) or "," in match.group(1))
        if re.search(r"\d\s?x\s?$", text[max(0, match.start() - 3):match.start()]) or re.search(r"x\s?$", prefix):
            continue
        if not explicit and value < 10:
            continue
        if re.match(r"\s?(pcs|pieces|x\b|days?|hrs?|minutes?)", text[match.end():match.end() + 8], re.IGNORECASE):
            continue
        found.append((match.start(), match.end(), value, explicit))
    return found


def resolve_date(text: str, today: date) -> tuple[date, bool]:
    t = text.lower()
    if re.search(r"day before yesterday|kamakalawa", t):
        return today - timedelta(days=2), True
    if re.search(r"yesterday|kahapon|last night", t):
        return today - timedelta(days=1), True
    if re.search(r"\btoday\b|kanina|this morning|tonight|earlier", t):
        return today, True
    match = re.search(r"\b(last|on|this past)?\s*(" + "|".join(WEEKDAYS) + r")\b", t)
    if match:
        target = WEEKDAYS.index(match.group(2))
        delta = (today.weekday() - target) % 7 or 7
        return today - timedelta(days=delta), True
    match = re.search(r"\b(" + "|".join(MONTHS) + r")[a-z]*\.?\s+(\d{1,2})\b", t)
    if match:
        month, day = MONTHS[match.group(1)], int(match.group(2))
        try:
            candidate = date(today.year, month, day)
            if candidate > today:
                candidate = date(today.year - 1, month, day)
            return candidate, True
        except ValueError:
            pass
    match = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", t)
    if match:
        try:
            year = int(match.group(3)) if match.group(3) else today.year
            year = year + 2000 if year < 100 else year
            candidate = date(year, int(match.group(1)), int(match.group(2)))
            if candidate <= today:
                return candidate, True
        except ValueError:
            pass
    if re.search(r"last week|the other day|few days ago|recently", t):
        return today - timedelta(days=7 if "week" in t else 3), False
    return today, True


def _account(text: str, context: CaptureContext) -> list[str]:
    t = text.lower()
    hits: list[tuple[int, str]] = []
    for account in context.accounts:
        name = account["name"].lower()
        idx = t.find(name)
        if idx >= 0:
            hits.append((idx, account["name"]))
            continue
        for alias_key, aliases in ACCOUNT_ALIASES.items():
            if alias_key in name or alias_key in (account.get("institution") or "").lower() or alias_key == account.get("type"):
                for alias in aliases:
                    m = re.search(rf"\b{re.escape(alias)}\b", t)
                    if m:
                        hits.append((m.start(), account["name"]))
                        break
    ordered = [name for _, name in sorted(hits)]
    return list(dict.fromkeys(ordered))


def _segment(text: str) -> list[str]:
    parts = re.split(r"\s*(?:;|\n|,(?!\d{3}\b)\s*(?:and\s+)?|\s+and\s+|\s+at pati\s+)\s*", text)
    parts = [p for p in parts if p.strip()]
    if len(parts) > 1 and all(_amounts(p) for p in parts):
        return parts
    return [text]


def _clean_merchant(raw: str) -> str | None:
    raw = re.split(r"\s+(?:for|with|using|via|thru|through|yesterday|today|kahapon|kanina|last|on|worth|₱|php)\b|\s+\d", raw,
                   flags=re.IGNORECASE)[0]
    raw = raw.strip(" .,!-")
    if not raw or len(raw) > 40:
        return None
    return raw[:1].upper() + raw[1:]


def parse_segment(text: str, context: CaptureContext) -> dict[str, Any]:
    today = date.fromisoformat(context.today)
    amounts = _amounts(text)
    explicit = [a for a in amounts if a[3]]
    chosen = (explicit or amounts)[0] if amounts else None
    occurred, certain = resolve_date(text, today)
    lowered = text.lower()

    accounts = _account(text, context)
    tx_type = "expense"
    if TRANSFER_RE.search(text) and len(accounts) >= 2:
        tx_type = "transfer"
    elif INCOME_RE.search(text) and not re.search(r"\b(paid|bought|spent|bayad)\b", lowered):
        tx_type = "income"

    merchant = category = subcategory = None
    alternatives: list[str] = []
    for pattern, name, cat, sub, alts in MERCHANTS:
        if re.search(pattern, lowered):
            merchant, category, subcategory, alternatives = name, cat, sub, list(alts)
            if name == "Grab" and re.search(r"food|meal|lunch|dinner", lowered):
                category, subcategory, alternatives = "Food & Dining", "Food delivery", []
            break
    at_match = re.search(r"\b(?:at|from|sa)\s+([A-Za-z0-9&' .-]+)", text)
    if at_match and tx_type != "transfer":
        candidate = _clean_merchant(at_match.group(1))
        if candidate and not any(candidate.lower() == a.lower() for a in accounts):
            known = next((m for m in context.known_merchants if m["name"].lower() == candidate.lower()), None)
            if merchant is None or (known and known["name"].lower() != merchant.lower()):
                merchant = known["name"] if known else candidate
                if known and known.get("category"):
                    category, subcategory, alternatives = known["category"], None, []
    if merchant is None:
        for known in context.known_merchants:
            if len(known["name"]) > 2 and re.search(rf"\b{re.escape(known['name'].lower())}\b", lowered):
                merchant = known["name"]
                if known.get("category"):
                    category = known["category"]
                break

    for pattern, cat, sub in KEYWORD_CATEGORIES:
        if re.search(pattern, lowered):
            if category is None:
                category, subcategory = cat, sub
            elif category != cat and cat not in alternatives and tx_type == "expense" and merchant not in {"Shopee", "Lazada", "Nike", "Adidas", "Uniqlo"}:
                alternatives.append(cat)
            elif category == cat and subcategory is None:
                subcategory = sub
            break

    if tx_type == "income":
        merchant = merchant if at_match else None
        if re.search(r"salary|sweldo|payroll|paycheck|13th month", lowered):
            category, subcategory = "Salary", None
        elif re.search(r"freelance|commission|client|project", lowered):
            category, subcategory = "Freelance", None
        elif re.search(r"allowance|baon", lowered):
            category, subcategory = "Allowance", None
        elif re.search(r"refund|cashback", lowered):
            category, subcategory = "Refunds", None
        elif re.search(r"gift", lowered):
            category, subcategory = "Gifts Received", None
        else:
            category, subcategory = "Other Income", None
        alternatives = []

    items: list[dict[str, Any]] = []
    bought = re.search(r"\b(?:bought|buy|purchased|got|ordered)\s+(?:a |an |some |my |new )?(.+?)\s+(?:for|worth|at|from|₱|php|\d)", text, re.IGNORECASE)
    if bought and tx_type == "expense":
        name = bought.group(1).strip(" ,.")
        if name and len(name) <= 60 and not re.fullmatch(r"(it|this|that|stuff|things)", name, re.IGNORECASE):
            items.append({"name": name[:1].upper() + name[1:], "quantity": 1, "amount": chosen[2] if chosen else None})

    payment = None
    if re.search(r"\b(qr ?ph|scan to pay)\b", lowered):
        payment = "QR Ph"
    elif re.search(r"\bdebit\b", lowered):
        payment = "Debit card"
    elif re.search(r"\b(credit card|visa|mastercard)\b", lowered):
        payment = "Credit card"

    return {
        "type": tx_type,
        "amount": chosen[2] if chosen else None,
        "date": occurred.isoformat(),
        "date_certain": certain,
        "merchant": merchant,
        "category": category,
        "subcategory": subcategory,
        "category_alternatives": alternatives,
        "account": accounts[0] if accounts else None,
        "to_account": accounts[1] if tx_type == "transfer" and len(accounts) > 1 else None,
        "payment_method": payment,
        "items": items,
        "notes": None,
    }


def parse_with_rules(text: str, context: CaptureContext) -> dict[str, Any]:
    segments = _segment(text.strip())
    transactions = [parse_segment(s, context) for s in segments]
    is_financial = any(t["amount"] is not None for t in transactions)
    return {"transactions": transactions, "is_financial": is_financial}
