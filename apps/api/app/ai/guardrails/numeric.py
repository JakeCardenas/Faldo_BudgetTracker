import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

MONEY_RE = re.compile(r"(?:₱|PHP\s?|\bP(?=\d))\s?(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:\s?(k|K|M)\b)?")
PERCENT_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s?%")
NUMBER_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")
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


def collect_allowed(values: list[Any]) -> tuple[set[Decimal], set[Decimal]]:
    money: set[Decimal] = set()
    pcts: set[Decimal] = set()

    def walk(obj: Any, key: str = "") -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                walk(v, str(k))
        elif isinstance(obj, list | tuple):
            for v in obj:
                walk(v, key)
        elif isinstance(obj, bool):
            return
        elif isinstance(obj, int | float | Decimal):
            d = Decimal(str(obj))
            if key.endswith("_minor"):
                money.add(abs(d) / 100)
            elif any(p in key for p in PCT_KEYS):
                pcts.add(abs(d))
                money.add(abs(d))
            else:
                money.add(abs(d))
                pcts.add(abs(d))
        elif isinstance(obj, str):
            for match in MONEY_RE.finditer(obj):
                amount = _to_decimal(match.group(1))
                if amount is not None:
                    multiplier = {"k": 1000, "K": 1000, "M": 1_000_000}.get(match.group(2) or "", 1)
                    money.add(abs(amount) * multiplier)
            for match in PERCENT_RE.finditer(obj):
                pct = _to_decimal(match.group(1))
                if pct is not None:
                    pcts.add(abs(pct))
            for match in NUMBER_RE.finditer(obj):
                num = _to_decimal(match.group(0))
                if num is not None:
                    money.add(abs(num))

    for value in values:
        walk(value)
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
    money, pcts = collect_allowed([*tool_outputs, user_message])
    bad_amounts: list[str] = []
    bad_pcts: list[str] = []
    for match in MONEY_RE.finditer(text):
        amount = _to_decimal(match.group(1))
        if amount is None:
            continue
        amount = abs(amount) * {"k": 1000, "K": 1000, "M": 1_000_000}.get(match.group(2) or "", 1)
        if not _money_supported(amount, money):
            bad_amounts.append(match.group(0))
    for match in PERCENT_RE.finditer(text):
        pct = _to_decimal(match.group(1))
        if pct is not None and not _pct_supported(abs(pct), pcts):
            bad_pcts.append(match.group(0))
    return NumericCheck(ok=not bad_amounts and not bad_pcts, unsupported_amounts=bad_amounts, unsupported_percents=bad_pcts)
