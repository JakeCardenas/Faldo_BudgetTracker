import io
import uuid
from datetime import date
from typing import Any

from PIL import Image

from app.ai.providers.base import CaptureContext
from app.core.db import scoped_session
from app.engine.periods import today_in
from app.models import Account, UserSettings
from app.models.enums import AccountType
from app.services import receipts
from tests.conftest import make_user

TODAY = date(2026, 9, 23)
BLANK = {"is_receipt": True, "document_type": "store_receipt", "direction": "expense", "merchant": None, "branch": None,
         "date": "2026-09-20", "time": None, "currency": "PHP", "items": [], "subtotal": None, "discount": None, "tax": None,
         "service_charge": None, "fees": None, "total": None, "due_date": None, "reference": None, "payment_method": None,
         "paid_from": None, "card_last4": None, "suggested_category": None, "description": None, "legibility": "good"}


def _read(**raw: Any) -> tuple[dict[str, Any], set[str]]:
    extraction, issues = receipts.validate_extraction({**BLANK, **raw}, TODAY, "PHP")
    return extraction, {i["code"] for i in issues}


def test_a_gcash_received_screenshot_is_income_with_its_reference():
    extraction, codes = _read(document_type="ewallet_transfer", direction="income", merchant="JU*N D*** C.", total=500,
                              reference="1023 456 789012", paid_from="GCash", description="Received from Juan")
    assert extraction["type"] == "income" and extraction["amount_minor"] == 50_000 and extraction["items"] == []
    assert extraction["notes"] == "Received from Juan · Ref 1023 456 789012" and extraction["document_label"] == "an e-wallet transfer"
    assert codes == set()


def test_a_utility_bill_keeps_its_due_date():
    extraction, codes = _read(document_type="utility_bill", merchant="Meralco", total=2345.6, due_date="2026-10-05",
                              description="Electricity for September")
    assert extraction["amount_minor"] == 234_560 and extraction["due_date"] == "2026-10-05"
    assert extraction["notes"].endswith("Due Oct 5, 2026") and codes == set()


def test_items_can_match_the_total_after_discounts_and_fees():
    items = [{"name": "Chickenjoy", "quantity": 2, "amount": 900}, {"name": "Sundae", "quantity": 3, "amount": 300}]
    _, codes = _read(merchant="Jollibee", items=items, discount=250, fees=49, total=999)
    assert "items_mismatch" not in codes
    _, codes = _read(merchant="Jollibee", items=items, total=700)
    assert "items_mismatch" in codes


def test_dates_are_read_the_philippine_way_round():
    extraction, codes = _read(date="2026-10-09")  # 09/10/2026 read as October 9 is in the future; it's September 10
    assert extraction["occurred_on"] == "2026-09-10" and "date_swapped" in codes
    extraction, codes = _read(date=None)
    assert extraction["occurred_on"] == TODAY.isoformat() and "date_unclear" in codes


def test_non_receipts_foreign_currency_and_transfers_are_flagged():
    _, codes = _read(is_receipt=False, document_type="not_financial")
    assert "not_receipt" in codes and "missing_total" in codes
    _, codes = _read(total=25, currency="USD")
    assert "currency" in codes
    extraction, codes = _read(direction="transfer", total=1000, document_type="ewallet_transfer")
    assert extraction["type"] == "transfer" and "transfer_account" in codes


def _account(name: str, kind: AccountType, institution: str | None = None, last4: str | None = None) -> Account:
    return Account(id=uuid.uuid4(), name=name, type=kind, institution=institution, card_last4=last4)


def test_the_paying_account_is_found_from_the_receipt():
    cash, gcash = _account("Wallet", AccountType.cash), _account("GCash", AccountType.e_wallet)
    bpi = _account("Savings", AccountType.bank, institution="BPI")
    card = _account("Travel card", AccountType.credit_card, last4="4821")
    accounts = [cash, gcash, bpi, card]
    assert receipts.match_account(accounts, {"card_last4": "****4821"}, None) is card
    assert receipts.match_account(accounts, {"paid_from": "GCash wallet"}, None) is gcash
    assert receipts.match_account(accounts, {"payment_method": "BPI Online"}, None) is bpi
    assert receipts.match_account(accounts, {"payment_method": "Cash"}, None) is cash
    assert receipts.match_account(accounts, {"payment_method": "Maya"}, bpi.id) is bpi, "falls back to the default account"


class Reader:
    name = "gemini"
    is_development = False
    supports_vision = True

    def __init__(self, raw: dict[str, Any]) -> None:
        self.raw = raw
        self.seen: dict[str, Any] = {}

    async def extract_receipt(self, image: bytes, mime_type: str, context: CaptureContext) -> dict[str, Any]:
        self.seen = {"accounts": [a["name"] for a in context.accounts], "income": [c["name"] for c in context.income_categories]}
        return self.raw


async def test_a_scanned_transfer_becomes_income_into_the_right_account(app, monkeypatch):
    client = await make_user(app, "Scanner")
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 0})
    gcash = (await client.post("/api/v1/accounts", json={"name": "GCash", "type": "e_wallet", "opening_balance_minor": 0})).json()
    income = [c for c in (await client.get("/api/v1/categories")).json() if c["kind"] == "income"]
    reader = Reader({**BLANK, "document_type": "ewallet_transfer", "direction": "income", "merchant": "Ninong Ben", "total": 10_000,
                     "date": today_in("Asia/Manila").isoformat(), "paid_from": "GCash", "suggested_category": income[0]["name"],
                     "reference": "9001"})
    monkeypatch.setattr(receipts, "get_llm", lambda: reader)
    queued: list[Any] = []

    async def hold(*args: Any, **kwargs: Any) -> None:
        queued.append(args)

    monkeypatch.setattr(receipts, "enqueue", hold)
    image = io.BytesIO()
    Image.new("RGB", (60, 90), "white").save(image, format="PNG")
    receipt = (await client.post("/api/v1/receipts", files={"file": ("gcash.png", image.getvalue(), "image/png")})).json()
    assert receipt["status"] == "processing" and queued
    async with scoped_session(uid) as db:
        settings = await db.get(UserSettings, uid)
        assert settings is not None
        await receipts.process_receipt(db, uid, uuid.UUID(receipt["id"]), settings, today_in(settings.timezone))
    read = (await client.get(f"/api/v1/receipts/{receipt['id']}")).json()
    extraction = read["extraction"]
    assert read["status"] == "needs_review" and extraction["type"] == "income"
    assert extraction["account_id"] == gcash["id"] and extraction["category_id"] == income[0]["id"]
    assert extraction["amount_minor"] == 1_000_000 and extraction["notes"] == "Ref 9001"
    assert reader.seen["accounts"] == ["Cash", "GCash"] and income[0]["name"] in reader.seen["income"]

    retried = (await client.post(f"/api/v1/receipts/{receipt['id']}/retry")).json()
    assert retried["status"] == "processing" and len(queued) == 2
    await client.aclose()
