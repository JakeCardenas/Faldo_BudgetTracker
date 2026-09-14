import re
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal, InvalidOperation

CURRENCY_SYMBOLS = {"PHP": "₱", "USD": "$", "EUR": "€", "SGD": "S$", "JPY": "¥", "GBP": "£"}
ZERO_DECIMAL_CURRENCIES = {"JPY"}


def minor_factor(currency: str) -> int:
    return 1 if currency in ZERO_DECIMAL_CURRENCIES else 100


def to_minor(amount: Decimal | int | float | str, currency: str = "PHP") -> int:
    try:
        value = Decimal(str(amount))
    except InvalidOperation as exc:
        raise ValueError(f"Invalid amount: {amount!r}") from exc
    return int((value * minor_factor(currency)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def to_major(amount_minor: int, currency: str = "PHP") -> Decimal:
    return Decimal(amount_minor) / minor_factor(currency)


def format_money(amount_minor: int, currency: str = "PHP", *, signed: bool = False, cents: bool | None = None) -> str:
    symbol = CURRENCY_SYMBOLS.get(currency, f"{currency} ")
    major = to_major(abs(amount_minor), currency)
    show_cents = cents if cents is not None else (major != major.to_integral_value())
    if currency in ZERO_DECIMAL_CURRENCIES:
        show_cents = False
    body = f"{major:,.2f}" if show_cents else f"{major.quantize(Decimal(1), rounding=ROUND_HALF_UP):,}"
    sign = "−" if amount_minor < 0 else ("+" if signed and amount_minor > 0 else "")
    return f"{sign}{symbol}{body}"


def percent(part: int | Decimal, whole: int | Decimal, places: int = 1) -> float | None:
    if not whole:
        return None
    value = (Decimal(part) / Decimal(whole) * 100).quantize(Decimal(10) ** -places, rounding=ROUND_HALF_EVEN)
    return float(value)


def percent_change(current: int, previous: int, places: int = 1) -> float | None:
    if previous == 0:
        return None
    return percent(current - previous, abs(previous), places)


_AMOUNT_RE = re.compile(
    r"(?:₱|php|p|\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(k|m)?\b",
    re.IGNORECASE,
)


def parse_amount_text(text: str, currency: str = "PHP") -> int | None:
    match = _AMOUNT_RE.search(text)
    if not match:
        return None
    whole = match.group(1).replace(",", "")
    decimals = match.group(2) or "0"
    value = Decimal(f"{whole}.{decimals}")
    suffix = (match.group(3) or "").lower()
    if suffix == "k":
        value *= 1000
    elif suffix == "m":
        value *= 1_000_000
    return to_minor(value, currency)
