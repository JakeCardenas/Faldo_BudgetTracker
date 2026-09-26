"""Backups: a versioned copy of a user's money records, with receipt images, that can be restored into their account.

Restoring only ever adds. A record the account already has is left exactly as it is: the same record (restored before,
or never deleted), or the same thing by name (a category, merchant, tag, budget month or statement line). Restoring the
same file twice therefore adds nothing the second time. Restored records get ids derived from the account and the
original id, so they can never collide with another account's records. An account whose name is taken by a different
account comes back as "Name (restored)". Everything happens in one database transaction: any failure undoes it all.

Settings, Faldo's memory, chats, insights, streaks and import history are not part of a backup; memory and summaries are
rebuilt from the restored records.
"""
import base64
import binascii
import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from enum import Enum as PyEnum
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, Numeric, String, inspect, select
from sqlalchemy.dialects.postgresql import JSONB, UUID, insert
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.engine.periods import month_start
from app.jobs.queue import enqueue_index, enqueue_monthly_summary
from app.models import (
    Account,
    Budget,
    BudgetCategory,
    Category,
    Challenge,
    Debt,
    DebtPayment,
    FinancialNote,
    GoalContribution,
    Merchant,
    MoneyPlan,
    PlannedPurchase,
    Receipt,
    RecurringPayment,
    SavingsGoal,
    Tag,
    Transaction,
    TransactionItem,
    transaction_tags,
)
from app.models.enums import ReceiptStatus
from app.services.receipts import sanitize_image
from app.storage.files import LocalStorage, get_storage, receipt_key

FORMAT = "faldo-backup"
VERSION = 1
MAX_BACKUP_BYTES = 30 * 1024 * 1024
RESTORE_NAMESPACE = uuid.UUID("7d0e6b0e-3c1a-4c5e-9a57-0f6c1f2b8a41")
RESTORED_RECEIPT_ERROR = "Restored from a backup before it was read. Tap Read it again."


@dataclass(frozen=True)
class Spec:
    key: str
    model: Any
    label: str
    refs: dict[str, str] = field(default_factory=dict)
    later: frozenset[str] = frozenset()  # references filled in once every table is in (they point forward)
    drop: frozenset[str] = frozenset()  # columns a backup leaves out


SPECS: list[Spec] = [
    Spec("accounts", Account, "Accounts"),
    Spec("categories", Category, "Categories", {"parent_id": "categories"}),
    Spec("merchants", Merchant, "Merchants", {"default_category_id": "categories"}),
    Spec("tags", Tag, "Tags"),
    Spec("recurring_payments", RecurringPayment, "Bills and recurring",
         {"account_id": "accounts", "category_id": "categories", "merchant_id": "merchants"}),
    Spec("savings_goals", SavingsGoal, "Goals", {"linked_account_id": "accounts"}),
    Spec("debts", Debt, "Money owed", {"source_transaction_id": "transactions"}, later=frozenset({"source_transaction_id"})),
    Spec("transactions", Transaction, "Transactions",
         {"account_id": "accounts", "to_account_id": "accounts", "merchant_id": "merchants", "category_id": "categories",
          "subcategory_id": "categories", "recurring_payment_id": "recurring_payments", "debt_id": "debts"},
         drop=frozenset({"import_batch_id"})),
    Spec("transaction_items", TransactionItem, "Items on transactions", {"transaction_id": "transactions"}),
    Spec("goal_contributions", GoalContribution, "Goal contributions",
         {"goal_id": "savings_goals", "transaction_id": "transactions"}),
    Spec("debt_payments", DebtPayment, "Repayments", {"debt_id": "debts", "transaction_id": "transactions"}),
    Spec("financial_notes", FinancialNote, "Notes", {"related_goal_id": "savings_goals"}),
    Spec("planned_purchases", PlannedPurchase, "Planned purchases",
         {"category_id": "categories", "bought_transaction_id": "transactions"}),
    Spec("budgets", Budget, "Budgets"),
    Spec("budget_categories", BudgetCategory, "Budget lines", {"budget_id": "budgets", "category_id": "categories"}),
    Spec("challenges", Challenge, "Challenges", {"category_id": "categories", "goal_id": "savings_goals"}),
    Spec("receipts", Receipt, "Receipts", {"transaction_id": "transactions"}, drop=frozenset({"storage_key"})),
]
SPEC_BY_KEY = {s.key: s for s in SPECS}
SKIPPED_COLUMNS = {"user_id", "updated_at"}
INDEXED = {"transactions": "transaction", "savings_goals": "goal", "recurring_payments": "recurring_payment",
           "debts": "debt", "budgets": "budget", "financial_notes": "financial_note"}
EXCLUDED = ["settings and preferences", "Faldo's memory (rebuilt from your records)", "chats and insights",
            "streaks and rewards", "statement import history"]


def _columns(model: Any, drop: frozenset[str] = frozenset()) -> dict[str, Any]:
    return {a.key: a.columns[0] for a in inspect(model).column_attrs if a.key not in SKIPPED_COLUMNS | drop}


def _encode(value: Any) -> Any:
    if isinstance(value, uuid.UUID | Decimal):
        return str(value)
    if isinstance(value, date | datetime):
        return value.isoformat()
    if isinstance(value, PyEnum):
        return value.value
    return value


def restored_id(user_id: uuid.UUID, table: str, original: uuid.UUID) -> uuid.UUID:
    return uuid.uuid5(RESTORE_NAMESPACE, f"{user_id}:{table}:{original}")


async def build_backup(db: AsyncSession, user_id: uuid.UUID, currency: str, include_receipts: bool = True) -> dict[str, Any]:
    tables: dict[str, list[dict[str, Any]]] = {}
    receipts: list[Receipt] = []
    for spec in SPECS:
        cols = _columns(spec.model, spec.drop)
        rows = (await db.execute(select(spec.model).where(spec.model.user_id == user_id))).scalars().all()
        tables[spec.key] = [{k: _encode(getattr(r, k)) for k in cols} for r in rows]
        if spec.model is Receipt:
            receipts = list(rows)
    links = (await db.execute(
        select(transaction_tags.c.transaction_id, transaction_tags.c.tag_id)
        .join(Tag, Tag.id == transaction_tags.c.tag_id).where(Tag.user_id == user_id)
    )).all()
    tables["transaction_tags"] = [{"transaction_id": str(t), "tag_id": str(g)} for t, g in links]
    plan = await db.get(MoneyPlan, user_id)
    money_plan = {k: _encode(getattr(plan, k)) for k in _columns(MoneyPlan)} if plan else None

    attachments = []
    if include_receipts:
        storage = get_storage(db, user_id)
        for receipt in receipts:
            if not receipt.storage_key:
                continue
            try:
                data = await storage.get(receipt.storage_key)
            except (FileNotFoundError, OSError):
                continue
            attachments.append({"receipt_id": str(receipt.id), "mime_type": receipt.mime_type,
                                "sha256": hashlib.sha256(data).hexdigest(), "data": base64.b64encode(data).decode()})
    return {"format": FORMAT, "version": VERSION, "exported_at": datetime.now(UTC).isoformat(), "currency": currency,
            "tables": tables, "money_plan": money_plan, "attachments": attachments}


# Reading a backup file. Everything is checked against the database columns before anything is written.

def _invalid(message: str) -> AppError:
    return AppError(f"This backup can't be restored: {message}", status_code=422)


def parse_backup(raw: bytes) -> tuple[dict[str, Any], str]:
    if len(raw) > MAX_BACKUP_BYTES:
        raise AppError("This backup is larger than 30 MB. Download one without receipt images and try again.", status_code=413)
    digest = hashlib.sha256(raw).hexdigest()
    try:
        data = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise _invalid("it isn't a Faldo backup file.") from exc
    if not isinstance(data, dict) or data.get("format") != FORMAT:
        raise _invalid("it isn't a Faldo backup file. Choose a file you downloaded with Download a backup.")
    version = data.get("version")
    if not isinstance(version, int) or isinstance(version, bool):
        raise _invalid("its version is missing.")
    if version > VERSION:
        raise _invalid(f"it was made by a newer version of Faldo (backup version {version}). Update Faldo and try again.")
    if version < 1:
        raise _invalid(f"backup version {version} isn't supported.")
    if not isinstance(data.get("currency"), str) or not isinstance(data.get("tables"), dict):
        raise _invalid("it is missing its currency or records.")
    unknown = set(data["tables"]) - set(SPEC_BY_KEY) - {"transaction_tags"}
    if unknown:
        raise _invalid(f"it has records Faldo doesn't know ({', '.join(sorted(unknown))}).")
    return data, digest


def _coerce(column: Any, value: Any, where: str) -> Any:
    kind = column.type
    try:
        if isinstance(kind, UUID):
            return uuid.UUID(value)
        if isinstance(kind, DateTime):
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        if isinstance(kind, Date):
            return date.fromisoformat(value)
        if isinstance(kind, Boolean):
            if not isinstance(value, bool):
                raise TypeError
            return value
        if isinstance(kind, Integer):
            if isinstance(value, bool) or not isinstance(value, int):
                raise TypeError
            return value
        if isinstance(kind, Numeric):
            return Decimal(str(value))
        if isinstance(kind, JSONB):
            if not isinstance(value, dict | list):
                raise TypeError
            return value
        if isinstance(kind, Enum):
            return kind.enum_class(value) if kind.enum_class else value
        if isinstance(kind, String):
            if not isinstance(value, str):
                raise TypeError
            if kind.length and len(value) > kind.length:
                raise ValueError
            return value
    except (TypeError, ValueError, AttributeError, InvalidOperation) as exc:
        raise _invalid(f"{where} has an invalid {column.key}.") from exc
    raise _invalid(f"{where} has an unsupported {column.key}.")


def _read_rows(spec: Spec, rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        raise _invalid(f"{spec.label.lower()} aren't a list.")
    cols = _columns(spec.model, spec.drop)
    out = []
    for index, row in enumerate(rows):
        where = f"{spec.label} record {index + 1}"
        if not isinstance(row, dict):
            raise _invalid(f"{where} isn't a record.")
        extra = set(row) - set(cols) - spec.drop
        if extra:
            raise _invalid(f"{where} has unknown fields ({', '.join(sorted(extra))}).")
        values: dict[str, Any] = {}
        for name, column in cols.items():
            if name not in row or row[name] is None:
                if name == "id" or (not column.nullable and column.default is None and column.server_default is None):
                    raise _invalid(f"{where} is missing {name}.")
                if name in row:
                    values[name] = None
                continue
            values[name] = _coerce(column, row[name], where)
        out.append(values)
    return out


@dataclass
class Parsed:
    rows: dict[str, list[dict[str, Any]]]
    links: list[tuple[uuid.UUID, uuid.UUID]]
    money_plan: dict[str, Any] | None
    attachments: dict[uuid.UUID, tuple[str, bytes]]


def validate_backup(data: dict[str, Any], currency: str) -> Parsed:
    tables = data["tables"]
    rows = {spec.key: _read_rows(spec, tables.get(spec.key, [])) for spec in SPECS}
    ids = {key: {r["id"] for r in items} for key, items in rows.items()}
    for key, items in rows.items():
        if len(ids[key]) != len(items):
            raise _invalid(f"{SPEC_BY_KEY[key].label.lower()} contain the same record twice.")
    for spec in SPECS:
        for row in rows[spec.key]:
            for column, target in spec.refs.items():
                ref = row.get(column)
                if ref is not None and ref not in ids[target]:
                    raise _invalid(f"a record in {spec.label.lower()} points to something the backup doesn't contain.")
    backup_currency = data["currency"]
    if backup_currency != currency:
        raise _invalid(f"it is in {backup_currency} and your Faldo is in {currency}. Faldo keeps one currency per account.")
    for key in ("accounts", "transactions", "savings_goals", "recurring_payments", "debts"):
        if any(r.get("currency", backup_currency) != backup_currency for r in rows[key]):
            raise _invalid("it mixes currencies, and Faldo keeps one currency per account.")

    links = []
    for link in tables.get("transaction_tags", []) or []:
        try:
            pair = (uuid.UUID(link["transaction_id"]), uuid.UUID(link["tag_id"]))
        except (TypeError, KeyError, ValueError, AttributeError) as exc:
            raise _invalid("a tag on a transaction is unreadable.") from exc
        if pair[0] not in ids["transactions"] or pair[1] not in ids["tags"]:
            raise _invalid("a tag on a transaction points to something the backup doesn't contain.")
        links.append(pair)

    money_plan = None
    if data.get("money_plan") is not None:
        plan_spec = Spec("money_plan", MoneyPlan, "Money plan", drop=frozenset({"user_id"}))
        money_plan = _read_rows(plan_spec, [data["money_plan"]])[0]

    attachments: dict[uuid.UUID, tuple[str, bytes]] = {}
    for item in data.get("attachments", []) or []:
        try:
            receipt_id = uuid.UUID(item["receipt_id"])
            content = base64.b64decode(item["data"], validate=True)
            stated = str(item["sha256"])
        except (TypeError, KeyError, ValueError, AttributeError, binascii.Error) as exc:
            raise _invalid("a receipt image is unreadable.") from exc
        if receipt_id not in ids["receipts"]:
            raise _invalid("a receipt image belongs to a receipt the backup doesn't contain.")
        if hashlib.sha256(content).hexdigest() != stated:
            raise _invalid("a receipt image is damaged (its checksum doesn't match).")
        attachments[receipt_id] = (stated, content)
    return Parsed(rows, links, money_plan, attachments)


# Restoring.

@dataclass
class Counts:
    in_backup: int = 0
    added: int = 0
    already_there: int = 0
    renamed: int = 0


class _Preview(Exception):
    """Raised inside the savepoint to undo a preview."""


async def _existing(db: AsyncSession, model: Any, user_id: uuid.UUID, candidates: set[uuid.UUID]) -> set[uuid.UUID]:
    found: set[uuid.UUID] = set()
    pool = list(candidates)
    for start in range(0, len(pool), 5000):
        chunk = pool[start:start + 5000]
        found |= set((await db.execute(select(model.id).where(model.user_id == user_id, model.id.in_(chunk)))).scalars())
    return found


def _free_name(name: str, taken: set[str]) -> str:
    for n in range(1, 100):
        suffix = " (restored)" if n == 1 else f" (restored {n})"
        candidate = f"{name[:60 - len(suffix)]}{suffix}"
        if candidate not in taken:
            return candidate
    raise _invalid("too many accounts share the same name.")


async def _apply(db: AsyncSession, user_id: uuid.UUID, parsed: Parsed, write_files: bool) -> dict[str, Any]:
    ids: dict[str, dict[uuid.UUID, uuid.UUID]] = {s.key: {} for s in SPECS}
    counts = {s.key: Counts(in_backup=len(parsed.rows[s.key])) for s in SPECS}
    added: dict[str, list[uuid.UUID]] = {s.key: [] for s in SPECS}

    categories = {(c.parent_id, c.name, c.kind): c.id for c in (await db.execute(
        select(Category).where(Category.user_id == user_id))).scalars()}
    merchants: dict[str, uuid.UUID] = {n: i for n, i in (await db.execute(
        select(Merchant.normalized_name, Merchant.id).where(Merchant.user_id == user_id))).all()}
    tags: dict[str, uuid.UUID] = {n: i for n, i in (await db.execute(select(Tag.name, Tag.id).where(Tag.user_id == user_id))).all()}
    account_names = set((await db.execute(select(Account.name).where(Account.user_id == user_id))).scalars())
    budgets: dict[date, uuid.UUID] = {m: i for m, i in (await db.execute(
        select(Budget.month, Budget.id).where(Budget.user_id == user_id))).all()}
    budget_lines: set[tuple[uuid.UUID, uuid.UUID]] = {(b, c) for b, c in (await db.execute(
        select(BudgetCategory.budget_id, BudgetCategory.category_id).where(BudgetCategory.user_id == user_id))).all()}
    statement_lines: dict[tuple[uuid.UUID, str], uuid.UUID] = {(a, ref): i for i, a, ref in (await db.execute(
        select(Transaction.id, Transaction.account_id, Transaction.external_ref)
        .where(Transaction.user_id == user_id, Transaction.external_ref.is_not(None)))).all()}
    receipt_hashes: dict[str, uuid.UUID] = {h: i for h, i in (await db.execute(
        select(Receipt.sha256, Receipt.id).where(Receipt.user_id == user_id))).all()}

    for spec in SPECS:
        rows = parsed.rows[spec.key]
        if spec.key == "categories":  # parents before their subcategories
            rows = sorted(rows, key=lambda r: r.get("parent_id") is not None)
        candidates = {r["id"] for r in rows} | {restored_id(user_id, spec.key, r["id"]) for r in rows}
        existing = await _existing(db, spec.model, user_id, candidates)
        mapping = ids[spec.key]
        for row in rows:
            old = row["id"]
            new = restored_id(user_id, spec.key, old)
            if old in existing or new in existing:
                mapping[old] = old if old in existing else new
                counts[spec.key].already_there += 1
                continue
            values = dict(row, id=new)
            for column, target in spec.refs.items():
                ref = values.get(column)
                if ref is None:
                    continue
                if column in spec.later:
                    values[column] = None
                    continue
                values[column] = ids[target][ref]

            match: uuid.UUID | None = None
            if spec.key == "categories":
                match = categories.get((values.get("parent_id"), values["name"], values["kind"]))
            elif spec.key == "merchants":
                match = merchants.get(values["normalized_name"])
            elif spec.key == "tags":
                match = tags.get(values["name"])
            elif spec.key == "budgets":
                match = budgets.get(values["month"])
            elif spec.key == "budget_categories" and (values["budget_id"], values["category_id"]) in budget_lines:
                match = new  # the month already budgets this category; nothing points at a budget line
            elif spec.key == "transactions" and values.get("external_ref"):
                match = statement_lines.get((values["account_id"], values["external_ref"]))
            elif spec.key == "receipts":
                match = receipt_hashes.get(values["sha256"])
            if match is not None:
                mapping[old] = match
                counts[spec.key].already_there += 1
                continue

            if spec.key == "accounts" and values["name"] in account_names:
                values["name"] = _free_name(values["name"], account_names)
                counts[spec.key].renamed += 1
            if spec.key == "receipts" and values["status"] == ReceiptStatus.processing:
                # Nothing is reading it any more; let the person read it again.
                values["status"] = ReceiptStatus.failed
                values["error"] = RESTORED_RECEIPT_ERROR

            db.add(spec.model(user_id=user_id, **values))
            mapping[old] = new
            counts[spec.key].added += 1
            added[spec.key].append(new)
            if spec.key == "categories":
                categories[(values.get("parent_id"), values["name"], values["kind"])] = new
            elif spec.key == "merchants":
                merchants[values["normalized_name"]] = new
            elif spec.key == "tags":
                tags[values["name"]] = new
            elif spec.key == "accounts":
                account_names.add(values["name"])
            elif spec.key == "budgets":
                budgets[values["month"]] = new
            elif spec.key == "budget_categories":
                budget_lines.add((values["budget_id"], values["category_id"]))
            elif spec.key == "transactions" and values.get("external_ref"):
                statement_lines[(values["account_id"], values["external_ref"])] = new
            elif spec.key == "receipts":
                receipt_hashes[values["sha256"]] = new
            if spec.key == "categories":
                await db.flush()  # a subcategory's parent must exist first
        await db.flush()

    # References that point forward (a split's original purchase) are filled in now that everything is in.
    for spec in SPECS:
        for row in parsed.rows[spec.key]:
            for column in spec.later:
                ref = row.get(column)
                new = ids[spec.key][row["id"]]
                if ref is None or new not in added[spec.key]:
                    continue
                obj = await db.get(spec.model, new)
                if obj is not None:
                    setattr(obj, column, ids[spec.refs[column]][ref])

    for txn_old, tag_old in parsed.links:
        txn, tag = ids["transactions"][txn_old], ids["tags"][tag_old]
        await db.execute(insert(transaction_tags).values(transaction_id=txn, tag_id=tag).on_conflict_do_nothing())

    plan_added = False
    if parsed.money_plan is not None and await db.get(MoneyPlan, user_id) is None:
        db.add(MoneyPlan(user_id=user_id, **parsed.money_plan))
        plan_added = True

    written: list[str] = []
    attachments = Counts(in_backup=len(parsed.attachments))
    storage = get_storage(db, user_id)
    try:
        for old, (_, content) in parsed.attachments.items():
            new = ids["receipts"][old]
            if new not in added["receipts"]:
                attachments.already_there += 1
                continue
            clean, mime, ext = sanitize_image(content)
            receipt = await db.get(Receipt, new)
            if receipt is None:
                continue
            key = receipt_key(user_id, new, ext)
            if write_files:
                await storage.put(key, clean, mime)
                written.append(key)
            receipt.storage_key, receipt.mime_type, receipt.size_bytes = key, mime, len(clean)
            attachments.added += 1
        await db.flush()
    except BaseException:
        if isinstance(storage, LocalStorage):
            for key in written:
                await storage.delete(key)
        raise

    for key, entity in INDEXED.items():
        for new in added[key]:
            await enqueue_index(db, user_id, entity, new)
    months = {month_start(r["occurred_on"]) for r in parsed.rows["transactions"]
              if ids["transactions"][r["id"]] in added["transactions"]}
    for month in months:
        await enqueue_monthly_summary(db, user_id, month)

    return {
        "records": [{"key": s.key, "label": s.label, **counts[s.key].__dict__} for s in SPECS if counts[s.key].in_backup],
        "attachments": {**attachments.__dict__, "receipts_without_image": sum(
            1 for r in parsed.rows["receipts"] if r["id"] not in parsed.attachments)},
        "money_plan": "added" if plan_added else ("already_there" if parsed.money_plan else None),
        "added_total": sum(c.added for c in counts.values()),
        "already_there_total": sum(c.already_there for c in counts.values()),
        "renamed_accounts": counts["accounts"].renamed,
    }


def _summary(data: dict[str, Any], digest: str, result: dict[str, Any]) -> dict[str, Any]:
    return {"format": FORMAT, "version": data["version"], "exported_at": data.get("exported_at"), "currency": data["currency"],
            "sha256": digest, "excluded": EXCLUDED, **result}


async def _run(db: AsyncSession, user_id: uuid.UUID, parsed: Parsed, write_files: bool) -> dict[str, Any]:
    try:
        return await _apply(db, user_id, parsed, write_files)
    except (IntegrityError, DataError) as exc:
        raise _invalid("some of its records conflict with each other or break Faldo's rules.") from exc


async def preview_restore(db: AsyncSession, user_id: uuid.UUID, currency: str, raw: bytes) -> dict[str, Any]:
    """Runs the real restore inside a savepoint and undoes it, so the counts are exactly what a restore would do."""
    data, digest = parse_backup(raw)
    parsed = validate_backup(data, currency)
    result: dict[str, Any] = {}
    try:
        async with db.begin_nested():
            result = await _run(db, user_id, parsed, write_files=False)
            raise _Preview
    except _Preview:
        pass
    return _summary(data, digest, result)


async def restore(db: AsyncSession, user_id: uuid.UUID, currency: str, raw: bytes, confirm_sha256: str) -> dict[str, Any]:
    data, digest = parse_backup(raw)
    if confirm_sha256 != digest:
        raise AppError("This isn't the file you previewed. Preview it again before restoring.", status_code=409)
    parsed = validate_backup(data, currency)
    return _summary(data, digest, await _run(db, user_id, parsed, write_files=True))
