"""Statement parsing: bank and e-wallet CSV exports → normalized rows.

Deterministic and source-agnostic. Every source (CSV today, bank or e-wallet APIs later) is normalized to the same
row shape before anything touches the ledger: date, description, signed amount in minor units, optional reference,
and a fingerprint that makes re-importing the same statement harmless.
"""
import csv
import hashlib
import io
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Literal

from app.engine.money import minor_factor

MAX_ROWS = 2000
HEADER_SCAN = 25
DateOrder = Literal["mdy", "dmy", "ymd"]

ROLE_SYNONYMS: dict[str, list[str]] = {
    "date": ["date", "transaction date", "posting date", "post date", "date and time", "date/time", "date time", "txn date",
             "trans date", "value date", "date posted", "datetime", "transaction date and time"],
    "description": ["description", "details", "particulars", "transaction details", "transaction description", "remarks",
                    "narrative", "memo", "payee", "merchant", "name", "transaction"],
    "amount": ["amount", "amount php", "amount in php", "transaction amount", "amt", "net amount"],
    "debit": ["debit", "debits", "withdrawal", "withdrawals", "money out", "paid out", "debit amount", "outflow", "sent",
              "amount out", "withdrawal amount"],
    "credit": ["credit", "credits", "deposit", "deposits", "money in", "paid in", "credit amount", "inflow", "received",
               "amount in", "deposit amount"],
    "reference": ["reference", "reference no", "ref no", "reference number", "ref #", "ref", "transaction id", "transaction no",
                  "reference id", "ref id", "trace no"],
    "balance": ["balance", "running balance", "available balance", "ending balance", "balance php"],
    "direction": ["dr/cr", "cr/dr", "debit/credit", "transaction type", "type", "dc"],
}
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_ISO = re.compile(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b")
_NUMERIC = re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b")
_NAMED_MDY = re.compile(r"\b([A-Za-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{2,4})\b")
_NAMED_DMY = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{2,4})\b")
_DEBIT_WORDS = {"dr", "debit", "d", "withdrawal", "out", "sent", "payment"}
_CREDIT_WORDS = {"cr", "credit", "c", "deposit", "in", "received"}


class StatementError(ValueError):
    pass


@dataclass(frozen=True)
class StatementRow:
    line: int
    occurred_on: date
    description: str
    amount_minor: int  # money in is positive, money out negative
    reference: str | None
    balance_minor: int | None
    fingerprint: str


@dataclass
class ParsedStatement:
    columns: dict[str, str]
    date_order: DateOrder
    date_order_assumed: bool
    signs_guessed: bool
    rows: list[StatementRow] = field(default_factory=list)
    errors: list[dict[str, object]] = field(default_factory=list)


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9/# ]", " ", value.lower())).strip()


_SYNONYMS = {role: {_norm(s) for s in names} for role, names in ROLE_SYNONYMS.items()}


def decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def _map_header(cells: list[str]) -> dict[str, int]:
    roles: dict[str, int] = {}
    for index, cell in enumerate(cells):
        key = _norm(cell)
        for role, names in _SYNONYMS.items():
            if role not in roles and key in names:
                roles[role] = index
                break
    return roles


def _is_header(roles: dict[str, int]) -> bool:
    return "date" in roles and ("amount" in roles or "debit" in roles or "credit" in roles)


def parse_amount(raw: str) -> Decimal | None:
    """Signed amount from a statement cell: '1,200.50', '(350.00)', '-80', '500.00 DR', '₱1,200', 'PHP 99'."""
    s = raw.strip().upper()
    if not s or s in {"-", "--", "N/A"}:
        return None
    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative, s = True, s[1:-1]
    for suffix in ("DR", "CR"):
        if s.endswith(suffix):
            negative = negative or suffix == "DR"
            s = s[: -len(suffix)].strip()
            break
    s = s.replace("PHP", "").replace("₱", "").replace(",", "").replace(" ", "")
    if s.startswith("P") and s[1:2].isdigit():
        s = s[1:]
    if s.endswith("-"):
        negative, s = not negative, s[:-1]
    if s.startswith("-"):
        negative, s = not negative, s[1:]
    s = s.lstrip("+")
    if not re.fullmatch(r"\d+(\.\d+)?", s):
        return None
    try:
        value = Decimal(s).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None
    return -value if negative else value


def _year(y: str) -> int:
    value = int(y)
    return value + 2000 if value < 100 else value


def detect_date_order(values: list[str]) -> tuple[DateOrder, bool]:
    """Pick MM/DD vs DD/MM for the whole file. Assumes MM/DD (common in PH exports) when every date is ambiguous."""
    mdy_only = dmy_only = ambiguous = iso = 0
    for v in values:
        if _ISO.search(v):
            iso += 1
            continue
        m = _NUMERIC.search(v)
        if not m:
            continue
        a, b, y = int(m.group(1)), int(m.group(2)), _year(m.group(3))
        mdy_ok, dmy_ok = _valid(y, a, b), _valid(y, b, a)
        if mdy_ok and dmy_ok:
            ambiguous += 1
        elif mdy_ok:
            mdy_only += 1
        elif dmy_ok:
            dmy_only += 1  # a malformed date counts for neither, so one bad row can't flip the file
    if dmy_only > mdy_only:
        return "dmy", False
    if mdy_only:
        return "mdy", False
    if ambiguous:
        return "mdy", True
    return ("ymd" if iso else "mdy"), False


def _valid(year: int, month: int, day: int) -> bool:
    try:
        date(year, month, day)
    except ValueError:
        return False
    return True


def parse_date(value: str, order: DateOrder) -> date | None:
    v = value.strip()
    try:
        m = _ISO.search(v)
        if m:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        m = _NUMERIC.search(v)
        if m:
            a, b, y = int(m.group(1)), int(m.group(2)), _year(m.group(3))
            return date(y, a, b) if order != "dmy" else date(y, b, a)
        m = _NAMED_MDY.search(v)
        if m and m.group(1)[:3].lower() in MONTHS:
            return date(_year(m.group(3)), MONTHS[m.group(1)[:3].lower()], int(m.group(2)))
        m = _NAMED_DMY.search(v)
        if m and m.group(2)[:3].lower() in MONTHS:
            return date(_year(m.group(3)), MONTHS[m.group(2)[:3].lower()], int(m.group(1)))
    except ValueError:
        return None
    return None


def _direction(cell: str) -> int:
    word = _norm(cell)
    if word in _DEBIT_WORDS:
        return -1
    if word in _CREDIT_WORDS:
        return 1
    return 0


def fingerprint(occurred_on: date, amount_minor: int, description: str, reference: str | None, occurrence: int) -> str:
    """Stable identity for a statement line so importing the same file twice doesn't duplicate anything."""
    if reference:
        return f"ref:{reference.strip()[:100]}"
    key = f"{occurred_on.isoformat()}|{amount_minor}|{_norm(description)}|{occurrence}"
    return "row:" + hashlib.sha256(key.encode()).hexdigest()[:40]


def parse_statement(
    text: str, *, currency: str = "PHP", today: date, date_order: DateOrder | None = None, invert: bool | None = None,
) -> ParsedStatement:
    sample = text[:4096]
    try:
        dialect: type[csv.Dialect] | csv.Dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    table = [row for row in csv.reader(io.StringIO(text), dialect) if any(cell.strip() for cell in row)]
    if not table:
        raise StatementError("The file is empty.")

    header_at, roles = -1, {}
    for index, row in enumerate(table[:HEADER_SCAN]):
        candidate = _map_header(row)
        if _is_header(candidate):
            header_at, roles = index, candidate
            break
    if header_at < 0:
        raise StatementError("Couldn't find the columns. The file needs a header row with a date and an amount "
                             "(or debit and credit) column.")
    body = table[header_at + 1:]
    if len(body) > MAX_ROWS:
        raise StatementError(f"That's more than {MAX_ROWS} rows. Split the statement into smaller files.")

    def cell(row: list[str], role: str) -> str:
        i = roles.get(role)
        return row[i].strip() if i is not None and i < len(row) else ""

    detected, assumed = detect_date_order([cell(r, "date") for r in body])
    order = date_order or detected
    header = table[header_at]
    columns = {role: header[i].strip() for role, i in roles.items()}

    # Direction only counts when its values really are debit/credit markers (a "Type" column is often a description).
    use_direction = "direction" in roles and "amount" in roles and sum(
        1 for r in body if _direction(cell(r, "direction"))) >= max(1, len(body) // 2)
    single_amount = "amount" in roles and not ("debit" in roles or "credit" in roles)
    raw_rows: list[tuple[int, date, str, Decimal, str | None, Decimal | None]] = []
    errors: list[dict[str, object]] = []
    for offset, row in enumerate(body):
        line = header_at + offset + 2
        raw_date = cell(row, "date")
        occurred = parse_date(raw_date, order)
        if occurred is None:
            if raw_date and any(ch.isdigit() for ch in raw_date):
                errors.append({"line": line, "message": f"Couldn't read the date '{raw_date[:40]}'."})
            continue  # totals rows, notes and page footers have no date
        if occurred > today:
            errors.append({"line": line, "message": "The date is in the future."})
            continue
        if single_amount:
            amount = parse_amount(cell(row, "amount"))
            if amount is not None and use_direction:
                amount = abs(amount) * (_direction(cell(row, "direction")) or (1 if amount >= 0 else -1))
        else:
            debit, credit = parse_amount(cell(row, "debit")), parse_amount(cell(row, "credit"))
            amount = None if debit is None and credit is None else (abs(credit or Decimal(0)) - abs(debit or Decimal(0)))
        if amount is None:
            errors.append({"line": line, "message": "Couldn't read the amount."})
            continue
        if amount == 0:
            continue
        description = re.sub(r"\s+", " ", cell(row, "description"))[:200] or cell(row, "reference")[:200] or "Statement entry"
        raw_rows.append((line, occurred, description, amount, cell(row, "reference") or None, parse_amount(cell(row, "balance"))))

    signs_guessed = False
    flip = bool(invert)
    if invert is None and single_amount and not use_direction and raw_rows and all(r[3] > 0 for r in raw_rows):
        flip, signs_guessed = True, True  # an export of plain positive amounts is almost always spending
    factor = minor_factor(currency)
    seen: Counter[str] = Counter()
    used: Counter[str] = Counter()
    rows: list[StatementRow] = []
    for line, occurred, description, amount, reference, balance in raw_rows:
        minor = int((amount * factor).to_integral_value(ROUND_HALF_UP)) * (-1 if flip else 1)
        base = f"{occurred}|{minor}|{_norm(description)}"
        seen[base] += 1
        print_ = fingerprint(occurred, minor, description, reference, seen[base])
        used[print_] += 1
        if used[print_] > 1:  # e.g. a fee line that shares its payment's reference number
            print_ = f"{print_}#{used[print_]}"
        rows.append(StatementRow(
            line=line, occurred_on=occurred, description=description, amount_minor=minor, reference=reference,
            balance_minor=int((balance * factor).to_integral_value(ROUND_HALF_UP)) if balance is not None else None,
            fingerprint=print_,
        ))
    return ParsedStatement(columns=columns, date_order=order, date_order_assumed=assumed and date_order is None,
                           signs_guessed=signs_guessed, rows=rows, errors=errors[:50])
