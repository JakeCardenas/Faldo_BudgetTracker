import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.capture.rules import parse_with_rules
from app.ai.factory import get_llm
from app.ai.providers.base import CaptureContext
from app.engine.money import format_money, to_minor
from app.models import Account, Category, Merchant, Transaction
from app.models.enums import CategoryKind
from app.models.identity import UserSettings
from app.services.common import normalize_name


async def build_context(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> CaptureContext:
    accounts = (await db.execute(select(Account).where(Account.user_id == user_id, Account.archived_at.is_(None))
                                 .order_by(Account.created_at))).scalars().all()
    categories = (await db.execute(select(Category).where(Category.user_id == user_id))).scalars().all()
    by_id = {c.id: c for c in categories}
    expense = [
        {"name": c.name, "subcategories": [s.name for s in categories if s.parent_id == c.id]}
        for c in categories if c.kind == CategoryKind.expense and c.parent_id is None
    ]
    income = [{"name": c.name} for c in categories if c.kind == CategoryKind.income and c.parent_id is None]
    merchants = (await db.execute(select(Merchant).where(Merchant.user_id == user_id).order_by(Merchant.updated_at.desc())
                                  .limit(80))).scalars().all()
    return CaptureContext(
        today=today.isoformat(),
        currency=settings.currency,
        accounts=[{"name": a.name, "type": a.type.value, "institution": a.institution or "", "id": str(a.id)} for a in accounts],
        expense_categories=expense,
        income_categories=income,
        known_merchants=[{"name": m.name, "category": by_id[m.default_category_id].name if m.default_category_id in by_id else ""}
                         for m in merchants],
    )


def _find(categories: list[Category], name: str | None, kind: CategoryKind, parent_id: uuid.UUID | None = None) -> Category | None:
    if not name:
        return None
    target = name.strip().lower()
    pool = [c for c in categories if c.kind == kind and c.parent_id == parent_id]
    return next((c for c in pool if c.name.lower() == target), None) or next(
        (c for c in pool if target in c.name.lower() or c.name.lower() in target), None)


async def _resolve(
    db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, raw: dict[str, Any],
    accounts: list[Account], categories: list[Category], merchants: dict[str, Merchant],
) -> dict[str, Any]:
    currency = settings.currency
    issues: list[dict[str, Any]] = []
    tx_type = raw.get("type") or "expense"
    kind = CategoryKind.income if tx_type == "income" else CategoryKind.expense
    account_options = [{"id": str(a.id), "label": a.name} for a in accounts]

    amount_minor = to_minor(raw["amount"], currency) if raw.get("amount") else None
    if not amount_minor or amount_minor <= 0:
        issues.append({"field": "amount", "code": "missing_amount", "message": "How much was it?", "blocking": True})

    try:
        occurred = date.fromisoformat(raw.get("date") or today.isoformat())
    except ValueError:
        occurred = today
        raw["date_certain"] = False
    if occurred > today:
        occurred = today
        raw["date_certain"] = False
    if not raw.get("date_certain", True):
        issues.append({"field": "occurred_on", "code": "date_unclear", "message": "The date wasn't clear. Is this right?"})

    def account_by_name(name: str | None) -> Account | None:
        if not name:
            return None
        return next((a for a in accounts if a.name.lower() == name.lower()), None) or next(
            (a for a in accounts if name.lower() in a.name.lower()), None)

    account = account_by_name(raw.get("account"))
    to_account = account_by_name(raw.get("to_account")) if tx_type == "transfer" else None
    if account is None:
        default = next((a for a in accounts if a.id == settings.default_account_id), None)
        account = default or next((a for a in accounts if a.is_spendable), accounts[0] if accounts else None)
        issues.append({"field": "account_id", "code": "account_unknown",
                       "message": "Which account did this use?" if tx_type != "income" else "Which account received this?",
                       "options": account_options})
    if tx_type == "transfer" and to_account is None:
        issues.append({"field": "to_account_id", "code": "transfer_destination", "message": "Where did the money go?",
                       "options": account_options, "blocking": True})

    merchant_name = raw.get("merchant")
    learned = merchants.get(normalize_name(merchant_name)) if merchant_name else None
    category = subcategory = None
    if tx_type != "transfer":
        if learned and learned.default_category_id:
            category = next((c for c in categories if c.id == learned.default_category_id), None)
            if category and category.parent_id:
                subcategory = category
                category = next((c for c in categories if c.id == subcategory.parent_id), None)
        if category is None:
            category = _find(categories, raw.get("category"), kind)
            if category is None and raw.get("category"):
                sub_any = next((c for c in categories if c.kind == kind and c.parent_id and c.name.lower() == str(raw["category"]).lower()), None)
                if sub_any:
                    subcategory = sub_any
                    category = next((c for c in categories if c.id == sub_any.parent_id), None)
        if category and subcategory is None:
            subcategory = _find(categories, raw.get("subcategory"), kind, category.id)
        top_options = [{"id": str(c.id), "label": c.name} for c in categories if c.kind == kind and c.parent_id is None]
        if category is None:
            issues.append({"field": "category_id", "code": "category_unknown", "message": "Pick a category.", "options": top_options})
        elif raw.get("category_alternatives") and not learned:
            alts = [c for name in raw["category_alternatives"] if (c := _find(categories, name, kind)) and c.id != category.id]
            if alts:
                issues.append({"field": "category_id", "code": "category_ambiguous",
                               "message": f"This could be {category.name} or {alts[0].name}.",
                               "options": [{"id": str(c.id), "label": c.name} for c in [category, *alts]]})

    if amount_minor and tx_type != "transfer" and (learned or not merchant_name):
        dup_query = select(Transaction.id, Transaction.occurred_on).where(
            Transaction.user_id == user_id, Transaction.amount_minor == amount_minor,
            Transaction.occurred_on.between(occurred - timedelta(days=2), occurred + timedelta(days=2)),
        )
        if learned:
            dup_query = dup_query.where(Transaction.merchant_id == learned.id)
        duplicate = (await db.execute(dup_query.limit(1))).first()
        if duplicate:
            issues.append({"field": "amount_minor", "code": "possible_duplicate",
                           "message": f"You already logged {format_money(amount_minor, currency)}"
                                      + (f" at {learned.name}" if learned else "") + f" on {duplicate.occurred_on:%b %-d}.",
                           "transaction_id": str(duplicate.id)})

    items = []
    for item in raw.get("items") or []:
        if not item.get("name"):
            continue
        item_amount = to_minor(item["amount"], currency) if item.get("amount") else amount_minor
        if item_amount is None:
            continue
        items.append({"name": item["name"][:120], "quantity": item.get("quantity") or 1, "amount_minor": item_amount})
    if amount_minor and sum(i["amount_minor"] for i in items) > amount_minor:
        items = []

    return {
        "type": tx_type,
        "amount_minor": amount_minor,
        "occurred_on": occurred.isoformat(),
        "merchant": merchant_name if tx_type != "transfer" else None,
        "category_id": str(category.id) if category else None,
        "category_name": category.name if category else None,
        "subcategory_id": str(subcategory.id) if subcategory else None,
        "subcategory_name": subcategory.name if subcategory else None,
        "account_id": str(account.id) if account else None,
        "account_name": account.name if account else None,
        "to_account_id": str(to_account.id) if to_account else None,
        "to_account_name": to_account.name if to_account else None,
        "payment_method": raw.get("payment_method"),
        "notes": raw.get("notes"),
        "items": items,
        "tags": [],
        "issues": issues,
        "needs_confirmation": bool(issues),
        "learned_from_history": bool(learned and learned.default_category_id),
    }


async def parse_capture(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, text: str) -> dict[str, Any]:
    context = await build_context(db, user_id, settings, today)
    provider = get_llm()
    rules = parse_with_rules(text, context)
    ai = await provider.parse_transactions(text, context)
    raw = rules
    source = "rules"
    if ai and ai.get("is_financial") and ai.get("transactions"):
        raw = ai
        source = provider.name
        if len(ai["transactions"]) == len(rules["transactions"]):
            for ai_txn, rule_txn in zip(ai["transactions"], rules["transactions"], strict=True):
                if rule_txn.get("amount") and ai_txn.get("amount") and abs(float(ai_txn["amount"]) - float(rule_txn["amount"])) > 0.009:
                    ai_txn["amount"] = rule_txn["amount"]

    accounts = list((await db.execute(select(Account).where(Account.user_id == user_id, Account.archived_at.is_(None))
                                      .order_by(Account.created_at))).scalars().all())
    categories = list((await db.execute(select(Category).where(Category.user_id == user_id))).scalars().all())
    merchants = {m.normalized_name: m for m in (await db.execute(select(Merchant).where(Merchant.user_id == user_id))).scalars()}
    drafts = [await _resolve(db, user_id, settings, today, dict(t), accounts, categories, merchants)
              for t in raw.get("transactions", [])[:10]]
    return {
        "input": text,
        "is_financial": bool(raw.get("is_financial")) and any(d["amount_minor"] for d in drafts),
        "parser": source,
        "provider_is_development": provider.is_development,
        "drafts": drafts,
    }
