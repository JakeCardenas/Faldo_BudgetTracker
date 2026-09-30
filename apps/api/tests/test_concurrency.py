"""Writes that a retry or a double tap could repeat, and edits that could overwrite each other.

Idempotency-Key: the same request twice (one after the other, or both at once) records one transaction and answers both
with it; the key can't be reused for a different request or by another person; a failed write leaves no trace of the
key. Versions: an edit made from an older copy is refused with the latest copy attached, two edits of the same version
can't both land, and a refused or failed edit changes nothing, items and tags included.
"""

import asyncio
import io
import uuid
from datetime import timedelta
from typing import Any

import pytest
from PIL import Image
from sqlalchemy import func, select

from app.core.db import scoped_session
from app.engine.periods import today_in
from app.models import IdempotencyKey, Transaction
from app.services import transactions as txn_service

TODAY = today_in("Asia/Manila").isoformat()
STALE = "urn:faldo:problem:stale-revision"
REUSED = "urn:faldo:problem:idempotency-key-reused"


async def _account(client: Any, name: str = "GCash") -> dict[str, Any]:
    r = await client.post("/api/v1/accounts", json={"name": name, "type": "e_wallet", "opening_balance_minor": 500_000})
    assert r.status_code == 201, r.text
    return r.json()


def _expense(account: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {"type": "expense", "amount_minor": 25_000, "occurred_on": TODAY, "account_id": account["id"],
            "merchant": "Jollibee", **extra}


async def _count(client: Any) -> int:
    return (await client.get("/api/v1/transactions")).json()["total_count"]


def _key() -> dict[str, str]:
    return {"Idempotency-Key": f"test-{uuid.uuid4()}"}


# Creating transactions


async def test_a_retried_create_returns_the_first_transaction_instead_of_a_second(client):
    account = await _account(client)
    headers = _key()
    first = await client.post("/api/v1/transactions", json=_expense(account), headers=headers)
    retry = await client.post("/api/v1/transactions", json=_expense(account), headers=headers)
    assert first.status_code == retry.status_code == 201
    assert retry.json() == first.json()
    assert retry.headers.get("Idempotent-Replayed") == "true" and "Idempotent-Replayed" not in first.headers
    assert await _count(client) == 1
    balance = next(a for a in (await client.get("/api/v1/accounts")).json() if a["id"] == account["id"])["balance_minor"]
    assert balance == 500_000 - 25_000  # taken out once


async def test_the_same_request_arriving_twice_at_once_records_it_once(client):
    account = await _account(client)
    headers = _key()
    results = await asyncio.gather(*[client.post("/api/v1/transactions", json=_expense(account), headers=headers)
                                     for _ in range(4)])
    assert [r.status_code for r in results] == [201] * 4
    assert len({r.json()["id"] for r in results}) == 1
    assert await _count(client) == 1


async def test_a_key_reused_for_a_different_transaction_is_refused(client):
    account = await _account(client)
    headers = _key()
    assert (await client.post("/api/v1/transactions", json=_expense(account), headers=headers)).status_code == 201
    other = await client.post("/api/v1/transactions", json=_expense(account, amount_minor=99_000), headers=headers)
    assert other.status_code == 409
    assert other.json()["type"] == REUSED and other.headers["content-type"].startswith("application/problem+json")
    assert await _count(client) == 1


async def test_keys_belong_to_one_person(client, other_client):
    mine, theirs = await _account(client), await _account(other_client)
    headers = _key()
    created = await client.post("/api/v1/transactions", json=_expense(mine), headers=headers)
    # The same key from someone else is their own, new request: it neither replays nor clashes with mine.
    other = await other_client.post("/api/v1/transactions", json=_expense(theirs), headers=headers)
    assert created.status_code == other.status_code == 201
    assert other.json()["id"] != created.json()["id"] and other.json()["account_id"] == theirs["id"]
    assert await _count(client) == 1 and await _count(other_client) == 1


async def test_a_failed_create_leaves_no_key_behind(client, monkeypatch):
    account = await _account(client)
    headers = _key()
    future = await client.post("/api/v1/transactions", json=_expense(account, occurred_on="2099-01-01"), headers=headers)
    assert future.status_code == 400
    # The key wasn't spent on the failure, so the corrected request goes through under it.
    fixed = await client.post("/api/v1/transactions", json=_expense(account), headers=headers)
    assert fixed.status_code == 201 and await _count(client) == 1

    # A failure after the transaction was written rolls back the transaction, the key and everything else together.
    async def broken(*args: Any) -> None:
        raise RuntimeError("indexing is down")
    monkeypatch.setattr(txn_service, "_after_write", broken)
    again = _key()
    with pytest.raises(RuntimeError):  # the test client re-raises what a real server would answer with a 500
        await client.post("/api/v1/transactions", json=_expense(account, amount_minor=1_000), headers=again)
    monkeypatch.undo()
    assert await _count(client) == 1
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    async with scoped_session(uid) as db:
        assert await db.scalar(select(func.count()).select_from(IdempotencyKey).where(
            IdempotencyKey.key == again["Idempotency-Key"])) == 0


async def test_a_malformed_key_is_rejected_and_no_key_still_works(client):
    account = await _account(client)
    bad = await client.post("/api/v1/transactions", json=_expense(account), headers={"Idempotency-Key": "short"})
    assert bad.status_code == 422
    assert (await client.post("/api/v1/transactions", json=_expense(account))).status_code == 201


# Capture drafts and receipts


async def test_confirming_capture_drafts_twice_saves_them_once(client):
    account = await _account(client)
    body = {"transactions": [_expense(account, merchant="Grab"), _expense(account, merchant="7-Eleven", amount_minor=8_000)]}
    headers = _key()
    first, retry = await asyncio.gather(client.post("/api/v1/capture/confirm", json=body, headers=headers),
                                        client.post("/api/v1/capture/confirm", json=body, headers=headers))
    assert first.status_code == retry.status_code == 201
    assert [t["id"] for t in first.json()] == [t["id"] for t in retry.json()]
    assert await _count(client) == 2


async def _receipt(client: Any) -> dict[str, Any]:
    image = io.BytesIO()
    Image.new("RGB", (64, 96), (250, 248, 240)).save(image, format="PNG")
    r = await client.post("/api/v1/receipts", files={"file": ("receipt.png", image.getvalue(), "image/png")}, headers=_key())
    assert r.status_code == 201, r.text
    return r.json()


async def test_a_receipt_is_confirmed_once_even_when_two_confirms_race(client):
    account = await _account(client)
    receipt = await _receipt(client)
    url = f"/api/v1/receipts/{receipt['id']}/confirm"
    # No key: the receipt row lock alone keeps two confirms from making two transactions.
    results = await asyncio.gather(client.post(url, json=_expense(account)), client.post(url, json=_expense(account)))
    assert sorted(r.status_code for r in results) == [200, 400]
    assert await _count(client) == 1


async def test_a_retried_receipt_confirm_gets_the_saved_transaction_back(client):
    account = await _account(client)
    receipt = await _receipt(client)
    url = f"/api/v1/receipts/{receipt['id']}/confirm"
    headers = _key()
    first = await client.post(url, json=_expense(account), headers=headers)
    retry = await client.post(url, json=_expense(account), headers=headers)
    assert first.status_code == retry.status_code == 200 and retry.json()["id"] == first.json()["id"]
    assert await _count(client) == 1


async def test_the_same_photo_uploaded_twice_at_once_makes_one_receipt(client):
    image = io.BytesIO()
    Image.new("RGB", (70, 100), (240, 240, 250)).save(image, format="PNG")
    headers = _key()
    results = await asyncio.gather(*[client.post("/api/v1/receipts", files={"file": ("r.png", image.getvalue(), "image/png")},
                                                 headers=headers) for _ in range(2)])
    assert [r.status_code for r in results] == [201, 201] and results[0].json()["id"] == results[1].json()["id"]


# Other writes that move money


async def test_a_money_owed_payment_sent_twice_at_once_is_recorded_once(client):
    account = await _account(client)
    debt = (await client.post("/api/v1/debts", json={"direction": "owed_to_me", "counterparty": "Mark",
                                                     "amount_minor": 50_000})).json()
    body = {"amount_minor": 20_000, "paid_on": TODAY, "account_id": account["id"]}
    headers = _key()
    results = await asyncio.gather(*[client.post(f"/api/v1/debts/{debt['id']}/payments", json=body, headers=headers)
                                     for _ in range(2)])
    assert [r.status_code for r in results] == [201, 201]
    assert results[0].json()["paid_minor"] == results[1].json()["paid_minor"] == 20_000
    balance = next(a for a in (await client.get("/api/v1/accounts")).json() if a["id"] == account["id"])["balance_minor"]
    assert balance == 500_000 + 20_000  # the repayment landed once


async def test_a_bill_marked_paid_twice_is_paid_once(client):
    account = await _account(client)
    due = (today_in("Asia/Manila") + timedelta(days=2)).isoformat()
    bill = (await client.post("/api/v1/recurring", json={"name": "Internet", "kind": "bill", "amount_minor": 1_699_00,
                                                         "frequency": "monthly", "next_due_on": due,
                                                         "account_id": account["id"]})).json()
    body = {"amount_minor": 1_699_00, "paid_on": TODAY, "account_id": account["id"]}
    headers = _key()
    first = await client.post(f"/api/v1/recurring/{bill['id']}/pay", json=body, headers=headers)
    retry = await client.post(f"/api/v1/recurring/{bill['id']}/pay", json=body, headers=headers)
    assert first.status_code == retry.status_code == 200 and retry.json()["id"] == first.json()["id"]
    assert await _count(client) == 1


async def test_a_goal_contribution_retried_moves_the_money_once(client):
    source = await _account(client, "BPI")
    savings = await _account(client, "Savings")
    goal = (await client.post("/api/v1/goals", json={"name": "Laptop", "target_minor": 60_000_00,
                                                     "linked_account_id": savings["id"]})).json()
    body = {"amount_minor": 5_000_00, "occurred_on": TODAY, "from_account_id": source["id"]}
    headers = _key()
    first = await client.post(f"/api/v1/goals/{goal['id']}/contributions", json=body, headers=headers)
    retry = await client.post(f"/api/v1/goals/{goal['id']}/contributions", json=body, headers=headers)
    assert first.status_code == retry.status_code == 201 and retry.json() == first.json()
    transfers = (await client.get("/api/v1/transactions", params={"type": ["transfer"]})).json()
    assert transfers["total_count"] == 1


# Editing transactions


async def _txn(client: Any, **extra: Any) -> dict[str, Any]:
    account = await _account(client, name=f"Wallet {uuid.uuid4().hex[:6]}")
    body = _expense(account, tags=["lunch"], items=[{"name": "Chickenjoy", "amount_minor": 20_000}], **extra)
    r = await client.post("/api/v1/transactions", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _edit(t: dict[str, Any], **changes: Any) -> dict[str, Any]:
    keep = ("type", "amount_minor", "occurred_on", "account_id", "merchant", "category_id", "notes", "tags", "version")
    return {**{k: t[k] for k in keep}, "items": [{"name": i["name"], "amount_minor": i["amount_minor"]} for i in t["items"]],
            **changes}


async def test_every_edit_moves_the_version_even_one_that_only_changes_tags(client):
    t = await _txn(client)
    assert t["version"] == 1
    edited = await client.put(f"/api/v1/transactions/{t['id']}", json=_edit(t, amount_minor=30_000))
    assert edited.status_code == 200 and edited.json()["version"] == 2
    tags_only = await client.put(f"/api/v1/transactions/{t['id']}", json=_edit(edited.json(), tags=["dinner"]))
    assert tags_only.status_code == 200 and tags_only.json()["version"] == 3 and tags_only.json()["tags"] == ["dinner"]


async def test_an_edit_from_an_older_copy_is_refused_with_the_latest_attached(client):
    t = await _txn(client)
    phone = await client.put(f"/api/v1/transactions/{t['id']}", json=_edit(t, amount_minor=31_000, tags=["from phone"]))
    assert phone.status_code == 200
    laptop = await client.put(f"/api/v1/transactions/{t['id']}", json=_edit(t, notes="from laptop", items=[]))
    assert laptop.status_code == 409
    problem = laptop.json()
    assert problem["type"] == STALE and problem["status"] == 409 and "changed" in problem["detail"]
    assert problem["current"]["version"] == 2 and problem["current"]["amount_minor"] == 31_000
    # Nothing of the refused edit landed: not the notes, not the emptied items, and the phone's tags survive.
    now = (await client.get(f"/api/v1/transactions/{t['id']}")).json()
    assert now["notes"] is None and len(now["items"]) == 1 and now["tags"] == ["from phone"] and now["version"] == 2
    # Saving again from the latest copy goes through.
    retry = await client.put(f"/api/v1/transactions/{t['id']}", json=_edit(problem["current"], notes="from laptop"))
    assert retry.status_code == 200 and retry.json()["version"] == 3


async def test_two_edits_of_the_same_version_cannot_both_win(client):
    t = await _txn(client)
    url = f"/api/v1/transactions/{t['id']}"
    results = await asyncio.gather(*[client.put(url, json=_edit(t, amount_minor=amount, tags=[f"t{amount}"]))
                                     for amount in (21_000, 22_000, 23_000)])
    codes = sorted(r.status_code for r in results)
    assert codes == [200, 409, 409]
    winner = next(r.json() for r in results if r.status_code == 200)
    now = (await client.get(url)).json()
    assert now["version"] == 2 and now["amount_minor"] == winner["amount_minor"] and now["tags"] == winner["tags"]


async def test_a_failed_edit_rolls_back_items_tags_and_version_together(client, monkeypatch):
    t = await _txn(client)

    async def broken(*args: Any) -> None:
        raise RuntimeError("indexing is down")
    monkeypatch.setattr(txn_service, "_after_write", broken)
    with pytest.raises(RuntimeError):  # re-raised by the test client; a real server answers 500
        await client.put(f"/api/v1/transactions/{t['id']}", json=_edit(t, tags=["new"], items=[], amount_minor=40_000))
    monkeypatch.undo()
    now = (await client.get(f"/api/v1/transactions/{t['id']}")).json()
    assert (now["version"], now["amount_minor"], now["tags"], len(now["items"])) == (1, 25_000, ["lunch"], 1)


async def test_editing_someone_elses_transaction_reveals_nothing(client, other_client):
    t = await _txn(client)
    theirs = await other_client.put(f"/api/v1/transactions/{t['id']}", json=_edit(t, notes="not mine"))
    # Not found, whatever version was sent: no stale-revision answer, so no copy of the transaction leaks.
    assert theirs.status_code == 404 and "current" not in theirs.json()
    stale = await other_client.put(f"/api/v1/transactions/{t['id']}", json=_edit(t, version=99))
    assert stale.status_code == 404 and "current" not in stale.json()
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    async with scoped_session(uid) as db:
        assert (await db.get(Transaction, uuid.UUID(t["id"]))).version == 1  # type: ignore[union-attr]


async def test_an_edit_without_a_version_is_rejected(client):
    t = await _txn(client)
    body = _edit(t)
    del body["version"]
    assert (await client.put(f"/api/v1/transactions/{t['id']}", json=body)).status_code == 422
