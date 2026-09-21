"""Statement import: preview a bank or e-wallet CSV, then turn the confirmed rows into ordinary transactions.

Nothing is written until the user confirms. Rows already imported are skipped by their fingerprint, rows that look
like something already logged by hand are left unticked, and moves between the user's own accounts are suggested as
transfers so they don't count as income or spending.
"""
import re
import uuid
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.capture.rules import categorize_text
from app.core.errors import AppError, Conflict
from app.engine.periods import month_start
from app.engine.statements import DateOrder, StatementError, decode, parse_statement
from app.jobs.queue import enqueue_index, enqueue_monthly_summary, enqueue_unindex
from app.models import Account, Category, Debt, ImportBatch, Merchant, Transaction
from app.models.enums import CategoryKind, TransactionSource, TransactionType
from app.schemas.ledger import ImportCommitIn
from app.services.categories import resolve_category_pair
from app.services.common import get_owned, normalize_name
from app.services.transactions import get_or_create_merchant

MAX_BYTES = 2 * 1024 * 1024
DUPLICATE_WINDOW_DAYS = 2
TRANSFER_RE = re.compile(
    r"\b(cash[- ]?in|cash[- ]?out|fund transfer|transfer(?:red)?|instapay|pesonet|send money|sent to|received from|"
    r"bank transfer|top[- ]?up|gsave|move to|moved to|own account|savings transfer)\b", re.IGNORECASE)


async def _usable_account(db: AsyncSession, user_id: uuid.UUID, account_id: uuid.UUID) -> Account:
    account = await get_owned(db, Account, account_id, user_id, "Account")
    if account.archived_at is not None:
        raise AppError("That account is archived.")
    return account


def _find(categories: list[Category], name: str | None, kind: CategoryKind, parent_id: uuid.UUID | None = None) -> Category | None:
    if not name:
        return None
    pool = [c for c in categories if c.kind == kind and c.parent_id == parent_id]
    return next((c for c in pool if c.name.lower() == name.lower()), None)


async def _existing_refs(db: AsyncSession, user_id: uuid.UUID, account_id: uuid.UUID, refs: list[str]) -> set[str]:
    """Fingerprints already imported for this account. A transfer is stored on its source account, so check both sides."""
    rows = (await db.execute(
        select(Transaction.external_ref).where(
            Transaction.user_id == user_id, Transaction.external_ref.in_(refs),
            or_(Transaction.account_id == account_id, Transaction.to_account_id == account_id))
    )).scalars()
    return {ref for ref in rows if ref}


async def preview_import(
    db: AsyncSession, user_id: uuid.UUID, today: date, account_id: uuid.UUID, data: bytes,
    date_order: DateOrder | None = None, invert: bool | None = None,
) -> dict[str, Any]:
    account = await _usable_account(db, user_id, account_id)
    if len(data) > MAX_BYTES:
        raise AppError("The file is too large. Use a CSV under 2 MB.", status_code=413)
    try:
        parsed = parse_statement(decode(data), currency=account.currency, today=today, date_order=date_order, invert=invert)
    except StatementError as exc:
        raise AppError(str(exc)) from exc
    if not parsed.rows:
        raise AppError("No transactions were found in this file." + (f" {parsed.errors[0]['message']}" if parsed.errors else ""))

    existing_refs = await _existing_refs(db, user_id, account.id, [r.fingerprint for r in parsed.rows])
    lo = min(r.occurred_on for r in parsed.rows) - timedelta(days=DUPLICATE_WINDOW_DAYS)
    hi = max(r.occurred_on for r in parsed.rows) + timedelta(days=DUPLICATE_WINDOW_DAYS)
    logged: dict[int, list[date]] = defaultdict(list)
    for occurred, amount, type_ in (await db.execute(
        select(Transaction.occurred_on, Transaction.amount_minor, Transaction.type).where(
            Transaction.user_id == user_id, Transaction.account_id == account.id, Transaction.external_ref.is_(None),
            Transaction.type.in_([TransactionType.expense, TransactionType.income]), Transaction.occurred_on.between(lo, hi))
    )).all():
        logged[amount if type_ == TransactionType.income else -amount].append(occurred)
    # Transfers touching this account, including ones imported from the other account's statement.
    for occurred, amount, source_id in (await db.execute(
        select(Transaction.occurred_on, Transaction.amount_minor, Transaction.account_id).where(
            Transaction.user_id == user_id, Transaction.type == TransactionType.transfer,
            or_(Transaction.account_id == account.id, Transaction.to_account_id == account.id),
            Transaction.occurred_on.between(lo, hi))
    )).all():
        logged[-amount if source_id == account.id else amount].append(occurred)

    categories = list((await db.execute(select(Category).where(Category.user_id == user_id))).scalars())
    learned = [(m.normalized_name, m.name, m.default_category_id) for m in (await db.execute(
        select(Merchant).where(Merchant.user_id == user_id, Merchant.default_category_id.is_not(None))
    )).scalars() if len(m.normalized_name) >= 3]
    others = [a for a in (await db.execute(
        select(Account).where(Account.user_id == user_id, Account.id != account.id, Account.archived_at.is_(None))
    )).scalars()]

    rows: list[dict[str, Any]] = []
    for r in parsed.rows:
        lowered = normalize_name(r.description)
        status = "already_imported" if r.fingerprint in existing_refs else None
        if status is None:
            dates = logged.get(r.amount_minor, [])
            match = next((d for d in dates if abs((d - r.occurred_on).days) <= DUPLICATE_WINDOW_DAYS), None)
            if match is not None:
                dates.remove(match)
                status = "possible_duplicate"
        counter = next((a for a in others if len(a.name) >= 3 and normalize_name(a.name) in lowered), None)
        is_transfer = bool(TRANSFER_RE.search(r.description)) or counter is not None
        is_income = r.amount_minor > 0
        merchant: str | None = None
        category: Category | None = None
        known = next(((name, cid) for key, name, cid in learned if key in lowered), None) if not is_income else None
        if known:
            merchant = known[0]
            category = next((c for c in categories if c.id == known[1]), None)
        else:
            merchant, cat_name, sub_name = categorize_text(r.description, is_income)
            kind = CategoryKind.income if is_income else CategoryKind.expense
            parent = _find(categories, cat_name, kind)
            category = (_find(categories, sub_name, kind, parent.id) if parent and sub_name else None) or parent
        rows.append({
            "line": r.line, "external_ref": r.fingerprint, "occurred_on": r.occurred_on.isoformat(), "description": r.description,
            "amount_minor": r.amount_minor, "reference": r.reference, "merchant": merchant,
            "category_id": str(category.id) if category else None,
            "kind": "transfer" if is_transfer else "transaction",
            "counter_account_id": str(counter.id) if counter else None,
            "status": status, "include": status is None and not is_transfer,
        })

    fresh = [r for r in rows if r["status"] != "already_imported"]
    return {
        "account": {"id": str(account.id), "name": account.name, "currency": account.currency},
        "columns": parsed.columns,
        "date_order": parsed.date_order, "date_order_assumed": parsed.date_order_assumed, "signs_guessed": parsed.signs_guessed,
        "summary": {
            "rows": len(rows), "new": len(fresh),
            "money_in_minor": sum(r["amount_minor"] for r in fresh if r["amount_minor"] > 0),
            "money_out_minor": -sum(r["amount_minor"] for r in fresh if r["amount_minor"] < 0),
            "date_from": min(r.occurred_on for r in parsed.rows).isoformat(),
            "date_to": max(r.occurred_on for r in parsed.rows).isoformat(),
            "already_imported": len(rows) - len(fresh),
            "possible_duplicates": sum(1 for r in rows if r["status"] == "possible_duplicate"),
            "transfers": sum(1 for r in rows if r["kind"] == "transfer"),
        },
        "rows": rows,
        "errors": parsed.errors,
        "other_accounts": [{"id": str(a.id), "name": a.name} for a in others],
    }


async def commit_import(db: AsyncSession, user_id: uuid.UUID, today: date, data: ImportCommitIn) -> dict[str, Any]:
    account = await _usable_account(db, user_id, data.account_id)
    existing = await _existing_refs(db, user_id, account.id, [r.external_ref for r in data.rows])
    batch = ImportBatch(user_id=user_id, account_id=account.id, source="csv", file_name=(data.file_name or None))
    db.add(batch)
    await db.flush()

    counters: dict[uuid.UUID, Account] = {}
    category_pairs: dict[uuid.UUID, tuple[Category | None, Category | None]] = {}
    created: list[Transaction] = []
    seen: set[str] = set()
    skipped = 0
    for row in data.rows:
        if row.external_ref in existing or row.external_ref in seen:
            skipped += 1
            continue
        seen.add(row.external_ref)
        if row.occurred_on > today:
            raise AppError(f"Line {row.line or '?'} is dated in the future.")
        amount = abs(row.amount_minor)
        common = {"user_id": user_id, "amount_minor": amount, "currency": account.currency, "occurred_on": row.occurred_on,
                  "notes": row.description, "source": TransactionSource.import_, "external_ref": row.external_ref,
                  "import_batch_id": batch.id}
        if row.kind == "transfer":
            if not row.counter_account_id:
                raise AppError(f"Choose the other account for the transfer on line {row.line or '?'}.")
            if row.counter_account_id not in counters:
                counters[row.counter_account_id] = await _usable_account(db, user_id, row.counter_account_id)
            other = counters[row.counter_account_id]
            if other.id == account.id:
                raise AppError("A transfer needs two different accounts.")
            source, target = (account, other) if row.amount_minor < 0 else (other, account)
            txn = Transaction(type=TransactionType.transfer, account_id=source.id, to_account_id=target.id, **common)
        else:
            is_income = row.amount_minor > 0
            category = sub = None
            if row.category_id:
                if row.category_id not in category_pairs:
                    category_pairs[row.category_id] = await resolve_category_pair(db, user_id, row.category_id, None)
                category, sub = category_pairs[row.category_id]
                expected = CategoryKind.income if is_income else CategoryKind.expense
                if category is not None and category.kind != expected:
                    raise AppError(f"Line {row.line or '?'} is {'money in' if is_income else 'money out'}, "
                                   f"but its category is for {category.kind.value}.")
            merchant = await get_or_create_merchant(db, user_id, row.merchant,
                                                    category.id if category and not is_income else None)
            txn = Transaction(type=TransactionType.income if is_income else TransactionType.expense, account_id=account.id,
                              merchant_id=merchant.id if merchant else None, category_id=category.id if category else None,
                              subcategory_id=sub.id if sub else None, **common)
        db.add(txn)
        created.append(txn)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise Conflict("Some of these rows were imported at the same time. Refresh and try again.") from exc

    if not created:  # nothing new: don't leave an empty import in the history
        await db.delete(batch)
        await db.flush()
        return {"batch_id": None, "imported": 0, "skipped": skipped}
    for txn in created:
        await enqueue_index(db, user_id, "transaction", txn.id)
    for month in {month_start(t.occurred_on) for t in created}:
        await enqueue_monthly_summary(db, user_id, month)
    batch.imported_count = len(created)
    batch.skipped_count = skipped
    batch.date_from = min(t.occurred_on for t in created)
    batch.date_to = max(t.occurred_on for t in created)
    await db.flush()
    return {"batch_id": str(batch.id), "imported": len(created), "skipped": skipped}


async def list_imports(db: AsyncSession, user_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = (await db.execute(
        select(ImportBatch, Account.name).join(Account, Account.id == ImportBatch.account_id)
        .where(ImportBatch.user_id == user_id).order_by(ImportBatch.created_at.desc()).limit(20)
    )).all()
    return [{"id": str(b.id), "account_name": name, "file_name": b.file_name, "imported": b.imported_count,
             "skipped": b.skipped_count, "date_from": b.date_from.isoformat() if b.date_from else None,
             "date_to": b.date_to.isoformat() if b.date_to else None, "created_at": b.created_at.isoformat()}
            for b, name in rows]


async def undo_import(db: AsyncSession, user_id: uuid.UUID, batch_id: uuid.UUID) -> int:
    """Remove every transaction an import created, and the batch itself."""
    batch = await get_owned(db, ImportBatch, batch_id, user_id, "Import")
    txns = (await db.execute(
        select(Transaction.id, Transaction.occurred_on).where(Transaction.user_id == user_id, Transaction.import_batch_id == batch.id)
    )).all()
    ids = [t.id for t in txns]
    if ids and await db.scalar(select(Debt.id).where(Debt.user_id == user_id, Debt.source_transaction_id.in_(ids)).limit(1)):
        raise Conflict("Some of these transactions were split in Money owed. Delete those records first.")
    for tid, _ in txns:
        await enqueue_unindex(db, user_id, "transaction", tid)
    await db.execute(delete(Transaction).where(Transaction.user_id == user_id, Transaction.import_batch_id == batch.id))
    for month in {month_start(occurred) for _, occurred in txns}:
        await enqueue_monthly_summary(db, user_id, month)
    await db.delete(batch)
    await db.flush()
    return len(ids)
