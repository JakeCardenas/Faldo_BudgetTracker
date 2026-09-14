import hashlib
import io
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
from app.models import Category, Receipt, Transaction
from app.models.enums import CategoryKind, ReceiptStatus, TransactionSource
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


def validate_extraction(raw: dict[str, Any], today: date, currency: str) -> tuple[dict[str, Any], list[dict[str, str]]]:
    issues: list[dict[str, str]] = []
    if not raw.get("is_receipt"):
        issues.append({"field": "image", "code": "not_receipt", "message": "This doesn't look like a receipt."})
    items: list[dict[str, Any]] = []
    for item in raw.get("items") or []:
        if item.get("name") and item.get("amount") is not None and item["amount"] >= 0:
            items.append({"name": str(item["name"])[:120], "quantity": item.get("quantity") or 1,
                          "amount_minor": to_minor(Decimal(str(item["amount"])), currency)})
    total = to_minor(Decimal(str(raw["total"])), currency) if raw.get("total") is not None else None
    subtotal = to_minor(Decimal(str(raw["subtotal"])), currency) if raw.get("subtotal") is not None else None
    item_sum = sum(int(i["amount_minor"]) for i in items)
    tolerance = 100
    if total is None:
        issues.append({"field": "amount_minor", "code": "missing_total", "message": "The total couldn't be read."})
    elif items:
        reference = subtotal if subtotal is not None else total
        if abs(item_sum - reference) > max(tolerance, reference // 100):
            issues.append({"field": "items", "code": "items_mismatch",
                           "message": "The items don't add up to the receipt total. Check for missing or misread lines."})
        if item_sum > total + tolerance:
            items = []
            issues.append({"field": "items", "code": "items_exceed_total", "message": "Items exceeded the total and were removed."})
    occurred = None
    if raw.get("date"):
        try:
            occurred = date.fromisoformat(raw["date"])
        except ValueError:
            occurred = None
    if occurred is None or occurred > today or occurred < today - timedelta(days=400):
        issues.append({"field": "occurred_on", "code": "date_unclear", "message": "Check the receipt date."})
        occurred = today
    if raw.get("currency") and raw["currency"].upper() not in {currency, "₱", "PESO", "PHP"}:
        issues.append({"field": "amount_minor", "code": "currency", "message": f"The receipt may not be in {currency}."})
    if raw.get("legibility") == "poor":
        issues.append({"field": "image", "code": "legibility", "message": "The photo is hard to read. Double-check every field."})
    return {
        "merchant": raw.get("merchant"),
        "occurred_on": occurred.isoformat(),
        "amount_minor": total,
        "items": items,
        "payment_method": raw.get("payment_method"),
        "suggested_category": raw.get("suggested_category"),
        "subtotal_minor": subtotal,
        "tax_minor": to_minor(Decimal(str(raw["tax"])), currency) if raw.get("tax") is not None else None,
    }, issues


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
    category = None
    if extraction.get("suggested_category"):
        category = (await db.execute(select(Category).where(
            Category.user_id == user_id, Category.kind == CategoryKind.expense, Category.parent_id.is_(None),
            Category.name.ilike(extraction["suggested_category"])))).scalars().first()
    extraction["category_id"] = str(category.id) if category else None
    receipt.extraction = extraction
    receipt.validation_issues = issues
    receipt.status = ReceiptStatus.needs_review
    receipt.error = None


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
