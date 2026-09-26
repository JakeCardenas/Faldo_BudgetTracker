import base64
import hashlib
import io
import json
import uuid
from datetime import timedelta
from pathlib import Path

from PIL import Image
from sqlalchemy import func, select

from app.core.db import scoped_session
from app.core.errors import AppError
from app.engine.periods import month_start, today_in
from app.models import Account, MoneyPlan, Receipt, Transaction
from app.services import backup as backup_service
from tests.conftest import make_user

P = 100
TODAY = today_in("Asia/Manila")


async def _account(client, name, type_="e_wallet", opening=10_000 * P):  # type: ignore[no-untyped-def]
    r = await client.post("/api/v1/accounts", json={"name": name, "type": type_, "opening_balance_minor": opening})
    assert r.status_code == 201, r.text
    return r.json()


async def _category(client, name, kind="expense"):  # type: ignore[no-untyped-def]
    return next(c["id"] for c in (await client.get("/api/v1/categories")).json() if c["name"] == name and c["kind"] == kind)


async def _receipt(client, colour="white"):  # type: ignore[no-untyped-def]
    image = io.BytesIO()
    Image.new("RGB", (60, 90), colour).save(image, format="PNG")
    r = await client.post("/api/v1/receipts", files={"file": ("receipt.png", image.getvalue(), "image/png")})
    assert r.status_code == 201, r.text
    return r.json()


async def _fill(client):  # type: ignore[no-untyped-def]
    """A little of everything a backup carries."""
    gcash = await _account(client, "GCash")
    bank = await _account(client, "BPI", "bank", 50_000 * P)
    savings = await _account(client, "Savings", "savings", 0)
    food = await _category(client, "Food & Dining")
    day = TODAY.isoformat()
    lunch = (await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 450 * P, "occurred_on": day, "account_id": gcash["id"], "category_id": food,
        "merchant": "Jollibee", "tags": ["work"], "items": [{"name": "Chickenjoy", "amount_minor": 250 * P}]})).json()
    await client.post("/api/v1/transactions", json={"type": "transfer", "amount_minor": 1_000 * P, "occurred_on": day,
                                                    "account_id": bank["id"], "to_account_id": gcash["id"]})
    dinner = (await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 3_000 * P, "occurred_on": day, "account_id": bank["id"], "category_id": food})).json()
    assert (await client.post(f"/api/v1/transactions/{dinner['id']}/split", json={"counterparty": "Mark", "amount_minor": 1_000 * P})).status_code == 201
    goal = (await client.post("/api/v1/goals", json={"name": "Emergency", "target_minor": 60_000 * P,
                                                     "linked_account_id": savings["id"]})).json()
    await client.post(f"/api/v1/goals/{goal['id']}/contributions",
                      json={"amount_minor": 2_000 * P, "occurred_on": day, "from_account_id": bank["id"]})
    await client.post("/api/v1/recurring", json={"name": "Netflix", "kind": "subscription", "amount_minor": 549 * P,
                                                 "frequency": "monthly", "next_due_on": (TODAY + timedelta(days=3)).isoformat(),
                                                 "account_id": gcash["id"]})
    await client.put("/api/v1/budgets", json={"month": TODAY.strftime("%Y-%m"), "lines": [{"category_id": food, "limit_minor": 5_000 * P}]})
    await client.post("/api/v1/planned-purchases", json={"name": "Headphones", "amount_minor": 5_999 * P})
    await client.post("/api/v1/notes", json={"content": "Bonus comes in December"})
    plan = await client.put("/api/v1/money-plan", json={"income_minor": 20_000 * P, "savings_minor": 2_000 * P, "joy_minor": 1_000 * P})
    assert plan.status_code == 200 and plan.json()["plan"]["savings_minor"] == 2_000 * P, plan.text
    receipt = await _receipt(client)
    return {"lunch": lunch, "receipt": receipt}


async def _download(client) -> bytes:  # type: ignore[no-untyped-def]
    r = await client.get("/api/v1/me/backup")
    assert r.status_code == 200, r.text
    assert "faldo-backup-" in r.headers["content-disposition"]
    return r.content


async def _preview(client, raw: bytes):  # type: ignore[no-untyped-def]
    return await client.post("/api/v1/me/backup/preview", files={"file": ("backup.json", raw, "application/json")})


async def _restore(client, raw: bytes, sha: str | None = None):  # type: ignore[no-untyped-def]
    return await client.post("/api/v1/me/backup/restore", files={"file": ("backup.json", raw, "application/json")},
                             data={"confirm_sha256": sha or hashlib.sha256(raw).hexdigest()})


def _counts(summary) -> dict[str, tuple[int, int, int]]:  # type: ignore[no-untyped-def]
    return {r["key"]: (r["in_backup"], r["added"], r["already_there"]) for r in summary["records"]}


async def _user_id(client) -> uuid.UUID:  # type: ignore[no-untyped-def]
    return uuid.UUID((await client.get("/api/v1/me")).json()["id"])


async def _count(user_id: uuid.UUID, model) -> int:  # type: ignore[no-untyped-def]
    async with scoped_session(user_id) as db:
        return int(await db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) or 0)


async def test_backup_restores_into_another_account_with_its_links_and_receipt_image(client, app):
    made = await _fill(client)
    raw = await _download(client)
    data = json.loads(raw)
    assert data["format"] == "faldo-backup" and data["version"] == 1 and data["currency"] == "PHP"
    assert len(data["attachments"]) == 1
    source_balances = {a["name"]: a["balance_minor"] for a in (await client.get("/api/v1/accounts")).json()}

    other = await make_user(app, "Restorer")
    try:
        preview = await _preview(other, raw)
        assert preview.status_code == 200, preview.text
        summary = preview.json()
        assert summary["sha256"] == hashlib.sha256(raw).hexdigest()
        counts = _counts(summary)
        assert counts["accounts"] == (3, 3, 0)
        assert counts["transactions"][1] == counts["transactions"][0]
        assert counts["categories"][1] == 0, "the default categories match by name instead of being duplicated"
        assert summary["attachments"]["added"] == 1
        assert "settings and preferences" in summary["excluded"]
        assert (await other.get("/api/v1/accounts")).json() == [], "a preview writes nothing"

        restored = await _restore(other, raw, summary["sha256"])
        assert restored.status_code == 200, restored.text
        assert _counts(restored.json()) == counts

        balances = {a["name"]: a["balance_minor"] for a in (await other.get("/api/v1/accounts")).json()}
        assert balances == source_balances
        txns = (await other.get("/api/v1/transactions", params={"limit": 100})).json()["items"]
        lunch = next(t for t in txns if t["merchant"] == "Jollibee")
        assert lunch["tags"] == ["work"] and lunch["items"][0]["name"] == "Chickenjoy"
        assert lunch["id"] != made["lunch"]["id"], "restored records get their own ids"
        debts = (await other.get("/api/v1/debts")).json()
        assert debts[0]["counterparty"] == "Mark" and debts[0]["source_transaction_id"] is not None
        goal = (await other.get("/api/v1/goals")).json()[0]
        assert goal["saved_minor"] == 2_000 * P and len(goal["contributions"]) == 1
        assert (await other.get("/api/v1/money-plan")).json()["plan"]["savings_minor"] == 2_000 * P
        assert [n["content"] for n in (await other.get("/api/v1/notes")).json()] == ["Bonus comes in December"]

        other_id = await _user_id(other)
        async with scoped_session(other_id) as db:
            receipt = (await db.execute(select(Receipt).where(Receipt.user_id == other_id))).scalar_one()
        image = await other.get(f"/api/v1/receipts/{receipt.id}/image")
        assert image.status_code == 200 and image.headers["content-type"] == "image/jpeg"
        with Image.open(io.BytesIO(image.content)) as img:
            assert img.size == (60, 90)
    finally:
        await other.aclose()


async def test_restoring_the_same_backup_twice_adds_nothing_the_second_time(client, app):
    await _fill(client)
    raw = await _download(client)
    other = await make_user(app, "Twice")
    try:
        assert (await _restore(other, raw)).status_code == 200
        before = await _count(await _user_id(other), Transaction)
        again = (await _restore(other, raw)).json()
        assert again["added_total"] == 0
        assert all(added == 0 for _, added, _ in _counts(again).values())
        assert await _count(await _user_id(other), Transaction) == before
    finally:
        await other.aclose()


async def test_restoring_your_own_backup_changes_nothing(client):
    await _fill(client)
    raw = await _download(client)
    user_id = await _user_id(client)
    before = await _count(user_id, Transaction)
    summary = (await _restore(client, raw)).json()
    assert summary["added_total"] == 0 and summary["attachments"]["added"] == 0
    assert await _count(user_id, Transaction) == before


async def test_an_account_with_a_taken_name_comes_back_renamed(client, app):
    await _account(client, "GCash")
    raw = await _download(client)
    other = await make_user(app, "Renamed")
    try:
        await _account(other, "GCash", opening=1 * P)
        summary = (await _restore(other, raw)).json()
        assert summary["renamed_accounts"] == 1
        names = sorted(a["name"] for a in (await other.get("/api/v1/accounts")).json())
        assert names == ["GCash", "GCash (restored)"]
    finally:
        await other.aclose()


async def test_backups_without_receipt_images_say_so(client, app):
    await _receipt(client)
    r = await client.get("/api/v1/me/backup", params={"receipts": "false"})
    raw = r.content
    assert json.loads(raw)["attachments"] == []
    other = await make_user(app, "NoImages")
    try:
        summary = (await _preview(other, raw)).json()
        assert summary["attachments"]["receipts_without_image"] == 1 and summary["attachments"]["added"] == 0
    finally:
        await other.aclose()


async def test_invalid_backups_are_refused_before_anything_is_written(client, app):
    await _fill(client)
    good = json.loads(await _download(client))
    other = await make_user(app, "Invalid")

    def variant(change):  # type: ignore[no-untyped-def]
        data = json.loads(json.dumps(good))
        change(data)
        return json.dumps(data).encode()

    cases = {
        b"not json at all": "isn't a Faldo backup",
        json.dumps({"format": "something-else"}).encode(): "isn't a Faldo backup",
        variant(lambda d: d.update(version=2)): "newer version of Faldo",
        variant(lambda d: d.update(version="1")): "version is missing",
        variant(lambda d: d.update(currency="USD")): "in USD",
        variant(lambda d: d["tables"]["transactions"][0].update(account_id=str(uuid.uuid4()))): "points to something",
        variant(lambda d: d["tables"]["accounts"][0].update(nickname="x")): "unknown fields",
        variant(lambda d: d["tables"]["transactions"][0].update(amount_minor="lots")): "invalid amount_minor",
        variant(lambda d: d["attachments"][0].update(data=base64.b64encode(b"tampered").decode())): "damaged",
        variant(lambda d: d["tables"].update(spaceships=[])): "doesn't know",
    }
    try:
        for raw, message in cases.items():
            r = await _preview(other, raw)
            assert r.status_code == 422, (message, r.text)
            assert message in r.json()["detail"], (message, r.json()["detail"])
            r = await _restore(other, raw)
            assert r.status_code == 422, (message, r.text)
        assert (await other.get("/api/v1/accounts")).json() == []
    finally:
        await other.aclose()


async def test_restore_needs_the_file_that_was_previewed(client, app):
    await _account(client, "GCash")
    raw = await _download(client)
    other = await make_user(app, "Confirm")
    try:
        r = await _restore(other, raw, sha="0" * 64)
        assert r.status_code == 409 and "previewed" in r.json()["detail"]
        assert (await other.get("/api/v1/accounts")).json() == []
    finally:
        await other.aclose()


async def test_a_failure_part_way_through_undoes_the_whole_restore(client, app, monkeypatch):
    await _fill(client)
    await _receipt(client, "black")
    raw = await _download(client)
    assert len(json.loads(raw)["attachments"]) == 2
    other = await make_user(app, "Rollback")
    real = backup_service.sanitize_image
    calls = []

    def fail_on_second(data: bytes):  # type: ignore[no-untyped-def]
        calls.append(1)
        if len(calls) == 2:
            raise AppError("Simulated failure while restoring a receipt image.")
        return real(data)

    written: list[str] = []
    real_receipt_key = backup_service.receipt_key

    def track(user_id, receipt_id, ext):  # type: ignore[no-untyped-def]
        key = real_receipt_key(user_id, receipt_id, ext)
        written.append(key)
        return key

    monkeypatch.setattr(backup_service, "sanitize_image", fail_on_second)
    monkeypatch.setattr(backup_service, "receipt_key", track)
    try:
        r = await _restore(other, raw)
        assert r.status_code == 400 and "Simulated failure" in r.json()["detail"]
        other_id = await _user_id(other)
        for model in (Account, Transaction, Receipt, MoneyPlan):
            assert await _count(other_id, model) == 0, model.__name__
        root = Path(backup_service.get_storage.__globals__["get_settings"]().receipt_storage_dir)
        assert written, "the first image was written before the failure"
        assert not any((root / key).exists() for key in written), "images written before the failure are removed"
    finally:
        await other.aclose()


async def test_restored_transactions_are_queued_for_search_and_summaries(client, app):
    await _fill(client)
    raw = await _download(client)
    other = await make_user(app, "Indexed")
    try:
        await _restore(other, raw)
        results = (await other.get("/api/v1/transactions", params={"q": "Jollibee"})).json()["items"]
        assert results and results[0]["merchant"] == "Jollibee"
        other_id = await _user_id(other)
        from app.models import Job

        async with scoped_session(None) as db:
            kinds = set((await db.execute(select(Job.kind).where(Job.user_id == other_id))).scalars())
        assert {"index_entity", "index_monthly_summary"} <= kinds, kinds
        async with scoped_session(None) as db:
            months = set((await db.execute(select(Job.payload["month"].astext).where(
                Job.user_id == other_id, Job.kind == "index_monthly_summary"))).scalars())
        assert month_start(TODAY).strftime("%Y-%m") in months
    finally:
        await other.aclose()
