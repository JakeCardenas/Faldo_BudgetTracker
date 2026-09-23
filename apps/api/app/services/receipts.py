import hashlib
import io
import re
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.capture.service import build_context
from app.ai.factory import get_llm
from app.ai.providers.base import ProviderUnavailable
from app.core.config import get_settings
from app.core.errors import AppError, NotFound
from app.engine.money import to_minor
from app.jobs.queue import enqueue
from app.models import Account, Category, Receipt, Transaction
from app.models.enums import AccountType, CategoryKind, ReceiptStatus, TransactionSource
from app.models.identity import UserSettings
from app.schemas.ledger import TransactionIn
from app.services.transactions import create_transaction
from app.storage.files import get_storage, receipt_key

ALLOWED_FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}
MAX_DIMENSION = 2400


def sanitize_image(data: bytes) -> tuple[bytes, str, str]:
    settings = get_settings()
    if len(data) > settings.receipt_max_bytes:
        raise AppError("The image is too large. Use a photo under 8 MB.", status_code=413)
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            probe.verify()
        if fmt not in ALLOWED_FORMATS:
            raise AppError("Upload a JPEG, PNG or WebP image.", status_code=415)
        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > 40_000_000:
                raise AppError("The image dimensions are too large.", status_code=413)
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))
            out = io.BytesIO()
            image.save(out, format="JPEG", quality=85, optimize=True)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise AppError("That file isn't a readable image.", status_code=415) from exc
    return out.getvalue(), "image/jpeg", "jpg"


def _minor(raw: dict[str, Any], key: str, currency: str) -> int | None:
    value = raw.get(key)
    if value is None:
        return None
    try:
        return abs(to_minor(Decimal(str(value)), currency))
    except (ArithmeticError, ValueError):
        return None


def _read_date(text: Any, today: date) -> tuple[date | None, bool]:
    """The date, and whether it was fixed by reading it the other way round (09/10 as September 10, not October 9)."""
    if not text:
        return None, False
    try:
        found = date.fromisoformat(str(text)[:10])
    except ValueError:
        return None, False
    if found > today and found.day <= 12:
        try:
            swapped = found.replace(month=found.day, day=found.month)
        except ValueError:
            return found, False
        if swapped <= today:
            return swapped, True
    return found, False


DOCUMENT_LABELS = {
    "store_receipt": "a store receipt", "restaurant_bill": "a restaurant bill", "online_order": "an online order",
    "ewallet_transfer": "an e-wallet transfer", "bank_transfer": "a bank transfer", "utility_bill": "a bill",
    "invoice": "an invoice", "fuel": "a fuel receipt", "ride_or_delivery": "a ride or delivery receipt",
    "atm_slip": "an ATM slip", "payslip": "a payslip", "other": "a money document",
}


def validate_extraction(raw: dict[str, Any], today: date, currency: str) -> tuple[dict[str, Any], list[dict[str, str]]]:
    issues: list[dict[str, str]] = []
    document = raw.get("document_type") or "store_receipt"
    if not raw.get("is_receipt") or document == "not_financial":
        issues.append({"field": "image", "code": "not_receipt", "message": "This doesn't look like a receipt or payment."})
    direction = raw.get("direction") if raw.get("direction") in {"expense", "income", "transfer"} else "expense"
    items: list[dict[str, Any]] = []
    for item in raw.get("items") or []:
        if item.get("name") and item.get("amount") is not None and item["amount"] >= 0:
            items.append({"name": str(item["name"])[:120], "quantity": item.get("quantity") or 1,
                          "amount_minor": to_minor(Decimal(str(item["amount"])), currency)})
    total, subtotal = _minor(raw, "total", currency), _minor(raw, "subtotal", currency)
    discount, fees = _minor(raw, "discount", currency) or 0, _minor(raw, "fees", currency) or 0
    service = _minor(raw, "service_charge", currency) or 0
    item_sum = sum(int(i["amount_minor"]) for i in items)
    tolerance = 100
    if total is None or total == 0:
        issues.append({"field": "amount_minor", "code": "missing_total", "message": "The total couldn't be read."})
    elif items:
        # Items can match the subtotal, the total, or the total once discounts, fees and service charges are counted.
        candidates = [c for c in (subtotal, total, total + discount - fees - service) if c is not None]
        if all(abs(item_sum - c) > max(tolerance, c // 100) for c in candidates):
            issues.append({"field": "items", "code": "items_mismatch",
                           "message": "The items don't add up to the total. Check for missing or misread lines."})
        if item_sum > total + discount + tolerance:
            items = []
            issues.append({"field": "items", "code": "items_exceed_total", "message": "Items exceeded the total and were removed."})
    occurred, swapped = _read_date(raw.get("date"), today)
    if swapped:
        issues.append({"field": "occurred_on", "code": "date_swapped", "message": "Check the date: it was read as month/day."})
    if occurred is None or occurred > today or occurred < today - timedelta(days=400):
        issues.append({"field": "occurred_on", "code": "date_unclear", "message": "Check the date."})
        occurred = today
    code = str(raw.get("currency") or "").upper().strip()
    if code and code not in {currency, "₱", "PESO", "PESOS", "PHP"}:
        issues.append({"field": "amount_minor", "code": "currency", "message": f"This may not be in {currency} ({code}). Convert it before saving."})
    if raw.get("legibility") == "poor":
        issues.append({"field": "image", "code": "legibility", "message": "The photo is hard to read. Double-check every field."})
    if direction == "transfer":
        issues.append({"field": "to_account_id", "code": "transfer_account", "message": "Pick the account the money went to."})

    due, _ = _read_date(raw.get("due_date"), today + timedelta(days=400))
    notes = [str(raw["description"]).strip()[:120]] if raw.get("description") else []
    if raw.get("reference"):
        notes.append(f"Ref {str(raw['reference']).strip()[:60]}")
    if due and document == "utility_bill":
        notes.append(f"Due {due:%b %-d, %Y}")
    return {
        "type": direction,
        "document_type": document,
        "document_label": DOCUMENT_LABELS.get(document, "a receipt"),
        "merchant": (str(raw["merchant"]).strip()[:80] or None) if raw.get("merchant") else None,
        "occurred_on": occurred.isoformat(),
        "amount_minor": total,
        "items": items,
        "payment_method": (str(raw["payment_method"]).strip()[:40] or None) if raw.get("payment_method") else None,
        "paid_from": raw.get("paid_from"),
        "card_last4": raw.get("card_last4"),
        "suggested_category": raw.get("suggested_category"),
        "subtotal_minor": subtotal,
        "tax_minor": _minor(raw, "tax", currency),
        "fees_minor": fees or None,
        "discount_minor": discount or None,
        "due_date": due.isoformat() if due else None,
        "reference": raw.get("reference"),
        "notes": " · ".join(notes) or None,
    }, issues


# Wallets and banks as receipts name them; "GCash" must never match an account called "Cash".
BRANDS = ["gcash", "paymaya", "maya", "grabpay", "shopeepay", "seabank", "maribank", "gotyme", "tonik", "coins.ph", "bpi", "bdo",
          "metrobank", "unionbank", "landbank", "security bank", "rcbc", "chinabank", "china bank", "pnb", "eastwest", "psbank",
          "cimb", "komo", "ownbank", "uno digital", "diskartech", "maya bank"]
GENERIC_WORDS = {"wallet", "account", "savings", "saving", "card", "bank", "my", "ewallet", "e", "debit", "credit", "online",
                 "app", "main", "personal"}


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def match_account(accounts: list[Account], extraction: dict[str, Any], default_id: uuid.UUID | None) -> Account | None:
    """The account the money came from (or went to): by card digits, then the wallet or bank named, then the account's
    own name as whole words, then cash, then the default account."""
    last4 = "".join(ch for ch in str(extraction.get("card_last4") or "") if ch.isdigit())[-4:]
    if len(last4) == 4:
        found = next((a for a in accounts if a.card_last4 == last4), None)
        if found:
            return found
    text = " ".join(str(extraction.get(k) or "") for k in ("paid_from", "payment_method")).lower()
    words = _words(text)
    for brand in BRANDS:
        if re.search(rf"\b{re.escape(brand)}\b", text):
            found = next((a for a in accounts if re.search(rf"\b{re.escape(brand)}\b", f"{a.name} {a.institution or ''}".lower())), None)
            if found:
                return found
    for account in accounts:
        own = _words(f"{account.name} {account.institution or ''}") - GENERIC_WORDS
        if own and own <= words:
            return account
    if "cash" in words:
        found = next((a for a in accounts if a.type == AccountType.cash), None)
        if found:
            return found
    return next((a for a in accounts if a.id == default_id), None)


def match_category(categories: list[Category], name: str | None) -> tuple[Category | None, Category | None]:
    """The main category and subcategory for a suggested name (a subcategory like Coffee brings its parent along)."""
    wanted = (name or "").lower().strip()
    if not wanted:
        return None, None
    found = next((c for c in categories if c.name.lower() == wanted), None) or next(
        (c for c in categories if wanted in c.name.lower() or c.name.lower() in wanted), None)
    if found is None:
        return None, None
    if found.parent_id:
        return next((c for c in categories if c.id == found.parent_id), None), found
    return found, None


async def upload_receipt(db: AsyncSession, user_id: uuid.UUID, data: bytes) -> Receipt:
    clean, mime, ext = sanitize_image(data)
    digest = hashlib.sha256(clean).hexdigest()
    existing = (await db.execute(select(Receipt).where(Receipt.user_id == user_id, Receipt.sha256 == digest,
                                                       Receipt.status != ReceiptStatus.discarded))).scalars().first()
    if existing:
        return existing
    provider = get_llm()
    receipt = Receipt(user_id=user_id, mime_type=mime, size_bytes=len(clean), sha256=digest,
                      status=ReceiptStatus.processing if provider.supports_vision else ReceiptStatus.unavailable,
                      provider=provider.name, validation_issues=[])
    if not provider.supports_vision:
        receipt.error = ("Automatic receipt reading isn't configured on this server. Your image is saved; enter the "
                         "details manually to create the transaction.")
    db.add(receipt)
    await db.flush()
    key = receipt_key(user_id, receipt.id, ext)
    await get_storage(db, user_id).put(key, clean, mime)
    receipt.storage_key = key
    if provider.supports_vision:
        await enqueue(db, "extract_receipt", user_id, {"receipt_id": str(receipt.id)})
    return receipt


async def process_receipt(db: AsyncSession, user_id: uuid.UUID, receipt_id: uuid.UUID, settings: UserSettings, today: date) -> None:
    receipt = await get_receipt(db, user_id, receipt_id)
    if receipt.status != ReceiptStatus.processing or not receipt.storage_key:
        return
    provider = get_llm()
    context = await build_context(db, user_id, settings, today)
    try:
        raw = await provider.extract_receipt(await get_storage(db, user_id).get(receipt.storage_key), receipt.mime_type, context)
    except ProviderUnavailable as exc:
        receipt.status = ReceiptStatus.failed
        receipt.error = str(exc)
        return
    extraction, issues = validate_extraction(raw, today, settings.currency)
    kind = CategoryKind.income if extraction["type"] == "income" else CategoryKind.expense
    categories = list((await db.execute(select(Category).where(Category.user_id == user_id, Category.kind == kind))).scalars())
    category, subcategory = match_category(categories, extraction.get("suggested_category"))
    extraction["category_id"] = str(category.id) if category and extraction["type"] != "transfer" else None
    extraction["subcategory_id"] = str(subcategory.id) if subcategory and extraction["category_id"] else None
    accounts = list((await db.execute(select(Account).where(Account.user_id == user_id, Account.archived_at.is_(None))
                                      .order_by(Account.created_at))).scalars())
    account = match_account(accounts, extraction, settings.default_account_id)
    extraction["account_id"] = str(account.id) if account else None
    receipt.extraction = extraction
    receipt.validation_issues = issues
    receipt.status = ReceiptStatus.needs_review
    receipt.error = None


async def retry_receipt(db: AsyncSession, user_id: uuid.UUID, receipt_id: uuid.UUID) -> Receipt:
    """Read a failed or unreadable receipt again, now that the AI may be back."""
    receipt = await get_receipt(db, user_id, receipt_id)
    if receipt.status not in {ReceiptStatus.failed, ReceiptStatus.unavailable, ReceiptStatus.needs_review} or not receipt.storage_key:
        raise AppError("This receipt can't be read again.")
    provider = get_llm()
    if not provider.supports_vision:
        raise AppError("Automatic receipt reading isn't available right now. Enter the details manually.")
    receipt.status, receipt.error, receipt.provider = ReceiptStatus.processing, None, provider.name
    await enqueue(db, "extract_receipt", user_id, {"receipt_id": str(receipt.id)})
    return receipt


async def get_receipt(db: AsyncSession, user_id: uuid.UUID, receipt_id: uuid.UUID) -> Receipt:
    receipt = (await db.execute(select(Receipt).where(Receipt.id == receipt_id, Receipt.user_id == user_id))).scalar_one_or_none()
    if receipt is None:
        raise NotFound("Receipt not found.")
    return receipt


async def confirm_receipt(db: AsyncSession, user_id: uuid.UUID, receipt_id: uuid.UUID, data: TransactionIn) -> Transaction:
    receipt = await get_receipt(db, user_id, receipt_id)
    if receipt.status in {ReceiptStatus.confirmed, ReceiptStatus.discarded}:
        raise AppError("This receipt has already been handled.")
    txn = await create_transaction(db, user_id, data, TransactionSource.receipt)
    receipt.status = ReceiptStatus.confirmed
    receipt.transaction_id = txn.id
    return txn


async def discard_receipt(db: AsyncSession, user_id: uuid.UUID, receipt_id: uuid.UUID) -> None:
    receipt = await get_receipt(db, user_id, receipt_id)
    if receipt.storage_key:
        await get_storage(db, user_id).delete(receipt.storage_key)
    receipt.storage_key = None
    receipt.status = ReceiptStatus.discarded
