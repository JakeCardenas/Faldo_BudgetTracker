"""Every money amount and percentage in an AI answer must come from Faldo's own numbers or the user's message.

What counts as a money claim in an answer: amounts with a peso sign or code (₱1,200, PHP 1,200, Php1.2k, P500), amounts
followed by a currency word (1,200 pesos, 1,200 piso, 1200 php), and scaled amounts (5k, 12 thousand, 7 libo, 2 million),
in English, Filipino or Taglish.

What can back one up: only money fields. From Faldo's data that's a `*_minor` value, the calculator's `result`, or an
amount written as money in text (formatted figures like "₱16,580"). Dates, ids, counts and other stray numbers don't
count, so a date like 2026 can't vouch for "₱2,026". From the user's message, any number they wrote except parts of dates
and times, since people ask "can I afford 5000?".
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

_NUM = r"(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)"
_SCALE_WORDS = {"k": 1000, "thousand": 1000, "libo": 1000, "m": 1_000_000, "million": 1_000_000, "milyon": 1_000_000}
_SCALE = r"(?:\s?(k|m|thousand|libo|million|milyon)\b)?"

PREFIXED = re.compile(rf"(?:₱|\bphp\.?|\bp(?=\d))\s?{_NUM}{_SCALE}", re.IGNORECASE)
SUFFIXED = re.compile(rf"(?<![\d.,₱]){_NUM}{_SCALE}\s?(?:pesos?|piso|php)\b", re.IGNORECASE)
SCALED = re.compile(rf"(?<![\d.,₱]){_NUM}\s?(k|thousand|libo|million|milyon)\b", re.IGNORECASE)
PERCENT_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s?(?:%|percent\b|porsyento\b)", re.IGNORECASE)
_DATE_OR_TIME = re.compile(r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{2,4})?|\d{1,2}:\d{2}")
_BARE = re.compile(r"(?<![\d.])\d[\d,]*(?:\.\d+)?")
PCT_KEYS = ("pct", "percent", "rate", "change")


@dataclass
class NumericCheck:
    ok: bool
    unsupported_amounts: list[str] = field(default_factory=list)
    unsupported_percents: list[str] = field(default_factory=list)


def _to_decimal(text: str) -> Decimal | None:
    try:
        return Decimal(text.replace(",", ""))
    except InvalidOperation:
        return None


def money_mentions(text: str) -> list[tuple[str, Decimal]]:
    """Every money amount written in the text, as (what was written, amount in pesos). Overlaps count once."""
    spans: list[tuple[int, int, str, Decimal]] = []
    for pattern in (PREFIXED, SUFFIXED, SCALED):
        for match in pattern.finditer(text):
            value = _to_decimal(match.group(1))
            if value is None:
                continue
            scale = (match.group(2) or "").lower()
            spans.append((match.start(), match.end(), match.group(0), abs(value) * _SCALE_WORDS.get(scale, 1)))
    spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
    found: list[tuple[str, Decimal]] = []
    end = -1
    for start, stop, written, amount in spans:
        if start >= end:
            found.append((written, amount))
            end = stop
    return found


def collect_allowed(values: list[Any]) -> tuple[set[Decimal], set[Decimal]]:
    """Amounts and percentages Faldo's own data vouches for (see the module docstring for what counts)."""
    money: set[Decimal] = set()
    pcts: set[Decimal] = set()

    def walk(obj: Any, key: str = "") -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                walk(v, str(k))
        elif isinstance(obj, list | tuple):
            for v in obj:
                walk(v, key)
        elif isinstance(obj, bool) or obj is None:
            return
        elif isinstance(obj, int | float | Decimal) or (key == "result" and isinstance(obj, str)):
            number = _to_decimal(str(obj))
            if number is None:
                return
            if key.endswith("_minor"):
                money.add(abs(number) / 100)
            elif key == "result":  # the calculator: a derived amount or ratio
                money.add(abs(number))
                pcts.add(abs(number))
            elif any(p in key for p in PCT_KEYS):
                pcts.add(abs(number))
        elif isinstance(obj, str):
            for _, amount in money_mentions(obj):
                money.add(amount)
            for match in PERCENT_RE.finditer(obj):
                pct = _to_decimal(match.group(1))
                if pct is not None:
                    pcts.add(abs(pct))

    for value in values:
        walk(value)
    return money, pcts


def _from_user(message: str) -> tuple[set[Decimal], set[Decimal]]:
    """Numbers the user wrote themselves, as amounts they might be asking about (dates and times aside)."""
    money = {amount for _, amount in money_mentions(message)}
    pcts: set[Decimal] = set()
    plain = _DATE_OR_TIME.sub(" ", message)
    for match in _BARE.finditer(plain):
        number = _to_decimal(match.group(0))
        if number is not None:
            money.add(abs(number))
            pcts.add(abs(number))
    for match in PERCENT_RE.finditer(message):
        pct = _to_decimal(match.group(1))
        if pct is not None:
            pcts.add(abs(pct))
    return money, pcts


def _money_supported(value: Decimal, allowed: set[Decimal]) -> bool:
    for a in allowed:
        if abs(value - a) <= max(Decimal("1"), a * Decimal("0.005")):
            return True
        for step in (Decimal(10), Decimal(100), Decimal(1000)):
            if a >= step * 2 and (a / step).quantize(Decimal(1)) * step == value:
                return True
        if a >= 1000 and (a / 1000).quantize(Decimal("0.1")) * 1000 == value:
            return True
    return False


def _pct_supported(value: Decimal, allowed: set[Decimal]) -> bool:
    return any(abs(value - a) <= Decimal("0.6") for a in allowed)


def check_numbers(text: str, tool_outputs: list[Any], user_message: str) -> NumericCheck:
    money, pcts = collect_allowed(list(tool_outputs))
    user_money, user_pcts = _from_user(user_message)
    money |= user_money
    pcts |= user_pcts
    bad_amounts = [written for written, amount in money_mentions(text) if not _money_supported(amount, money)]
    bad_pcts: list[str] = []
    for match in PERCENT_RE.finditer(text):
        pct = _to_decimal(match.group(1))
        if pct is not None and not _pct_supported(abs(pct), pcts):
            bad_pcts.append(match.group(0))
    return NumericCheck(ok=not bad_amounts and not bad_pcts, unsupported_amounts=bad_amounts, unsupported_percents=bad_pcts)
