import io
import uuid
from contextlib import contextmanager
from typing import Any

import pytest
from PIL import Image
from sqlalchemy import func, select

from app.api.v1 import auth as auth_module
from app.core.config import get_settings
from app.core.db import normalize_database_url, scoped_session
from app.engine.periods import today_in
from app.models import MemoryDocument, StoredFile
from tests.conftest import ApiClient, make_user

TODAY = today_in("Asia/Manila").isoformat()


@contextmanager
def settings_override(**values: Any):  # type: ignore[no-untyped-def]
    settings = get_settings()
    previous = {k: getattr(settings, k) for k in values}
    for key, value in values.items():
        setattr(settings, key, value)
    try:
        yield settings
    finally:
        for key, value in previous.items():
            setattr(settings, key, value)


def test_database_url_normalization():
    url, args = normalize_database_url("postgres://u:p@db.example.com:5432/app?sslmode=require&channel_binding=require&application_name=faldo")
    assert url == "postgresql+asyncpg://u:p@db.example.com:5432/app?application_name=faldo"
    assert args == {"ssl": "require"}
    assert normalize_database_url("postgresql+asyncpg://u:p@localhost/app")[1] == {}


def test_allowed_origins_accept_comma_separated_values(monkeypatch):
    from app.core.config import Settings

    monkeypatch.setenv("ALLOWED_ORIGINS", "https://faldo.vercel.app/, https://faldo.app")
    assert Settings().allowed_origins == ["https://faldo.vercel.app", "https://faldo.app"]


async def test_password_reset_flow(anon, app, monkeypatch):
    sent: list[str] = []

    async def fake_send(to: str, subject: str, text: str, html: str) -> bool:
        sent.append(text)
        return True

    monkeypatch.setattr(auth_module, "send_email", fake_send)
    email = f"reset-{uuid.uuid4().hex[:8]}@example.com"
    await anon.post("/api/v1/auth/register", json={"email": email, "password": "original-password-1", "display_name": "Reset"})
    other_device = ApiClient(transport=anon._transport, base_url="http://test")
    assert (await other_device.post("/api/v1/auth/login", json={"email": email, "password": "original-password-1"})).status_code == 200

    unknown = await anon.post("/api/v1/auth/password/forgot", json={"email": "nobody@example.com"})
    assert unknown.status_code == 202 and not sent
    r = await anon.post("/api/v1/auth/password/forgot", json={"email": email})
    assert r.status_code == 202 and len(sent) == 1
    token = sent[0].split("/reset-password/")[1].split()[0]

    assert (await anon.post("/api/v1/auth/password/reset", json={"token": "x" * 40, "password": "brand-new-password"})).status_code == 400
    r = await anon.post("/api/v1/auth/password/reset", json={"token": token, "password": "brand-new-password"})
    assert r.status_code == 200
    assert (await anon.post("/api/v1/auth/password/reset", json={"token": token, "password": "another-password-1"})).status_code == 400
    assert (await other_device.get("/api/v1/me")).status_code == 401
    other_device.cookies.clear()
    assert (await other_device.post("/api/v1/auth/login", json={"email": email, "password": "original-password-1"})).status_code == 401
    assert (await other_device.post("/api/v1/auth/login", json={"email": email, "password": "brand-new-password"})).status_code == 200
    await other_device.aclose()


async def test_change_password_and_sessions(app):
    email = f"sessions-{uuid.uuid4().hex[:8]}@example.com"
    first = ApiClient(transport=__import__("httpx").ASGITransport(app=app), base_url="http://test")
    await first.post("/api/v1/auth/register", json={"email": email, "password": "first-password-1", "display_name": "S"})
    second = ApiClient(transport=__import__("httpx").ASGITransport(app=app), base_url="http://test")
    await second.post("/api/v1/auth/login", json={"email": email, "password": "first-password-1"})
    third = ApiClient(transport=__import__("httpx").ASGITransport(app=app), base_url="http://test")
    await third.post("/api/v1/auth/login", json={"email": email, "password": "first-password-1"})

    sessions = (await first.get("/api/v1/auth/sessions")).json()
    assert len(sessions) == 3 and sum(s["current"] for s in sessions) == 1
    target = next(s for s in sessions if not s["current"])
    assert (await first.delete(f"/api/v1/auth/sessions/{target['id']}")).status_code == 204
    statuses = sorted([(await second.get("/api/v1/me")).status_code, (await third.get("/api/v1/me")).status_code])
    assert statuses == [200, 401]

    assert (await first.post("/api/v1/me/password", json={"current_password": "wrong-password", "new_password": "second-password-2"})).status_code == 400
    assert (await first.post("/api/v1/me/password", json={"current_password": "first-password-1", "new_password": "second-password-2"})).status_code == 204
    assert (await first.get("/api/v1/me")).status_code == 200
    assert (await second.get("/api/v1/me")).status_code == 401 and (await third.get("/api/v1/me")).status_code == 401
    for c in (first, second, third):
        await c.aclose()


async def test_category_update_and_delete(client):
    account = (await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash"})).json()
    created = (await client.post("/api/v1/categories", json={"name": "Hobbies", "kind": "expense"})).json()
    sub = (await client.post("/api/v1/categories", json={"name": "Guitar", "kind": "expense", "parent_id": created["id"]})).json()
    txn = (await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 50_000, "occurred_on": TODAY, "account_id": account["id"],
        "category_id": created["id"], "subcategory_id": sub["id"]})).json()
    r = await client.patch(f"/api/v1/categories/{created['id']}", json={"name": "Hobbies & Music", "is_essential": True})
    assert r.status_code == 200 and r.json()["name"] == "Hobbies & Music" and r.json()["is_essential"]
    assert (await client.patch(f"/api/v1/categories/{created['id']}", json={"name": "Groceries"})).status_code == 409
    assert (await client.delete(f"/api/v1/categories/{created['id']}")).status_code == 204
    after = (await client.get(f"/api/v1/transactions/{txn['id']}")).json()
    assert after["category_id"] is None and after["subcategory_id"] is None
    assert all(c["id"] not in {created["id"], sub["id"]} for c in (await client.get("/api/v1/categories")).json())


async def test_database_rate_limiter(client):
    with settings_override(rate_limit_backend="database", capture_requests_per_hour=2):
        from app.core.rate_limit import limiter

        key = f"test:{uuid.uuid4()}"
        await limiter.hit(key, 2, 60)
        await limiter.hit(key, 2, 60)
        from app.core.errors import RateLimited

        with pytest.raises(RateLimited):
            await limiter.hit(key, 2, 60)
        assert (await client.post("/api/v1/capture/parse", json={"text": "coffee 120"})).status_code == 200
        assert (await client.post("/api/v1/capture/parse", json={"text": "coffee 120"})).status_code == 200
        assert (await client.post("/api/v1/capture/parse", json={"text": "coffee 120"})).status_code == 429


async def test_inline_jobs_database_storage_and_receipts_queue(app):
    with settings_override(job_mode="inline", storage_backend="database"):
        client = await make_user(app, "Serverless")
        uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
        account = (await client.post("/api/v1/accounts", json={"name": "GCash", "type": "e_wallet"})).json()
        await client.post("/api/v1/transactions", json={
            "type": "expense", "amount_minor": 45_000, "occurred_on": TODAY, "account_id": account["id"],
            "merchant": "Book Sale", "items": [{"name": "Watercolor sketchbook", "amount_minor": 45_000}]})
        async with scoped_session(uid) as db:
            indexed = await db.scalar(select(func.count(MemoryDocument.id)).where(MemoryDocument.user_id == uid))
            assert indexed and indexed >= 2

        buf = io.BytesIO()
        Image.new("RGB", (300, 500), "white").save(buf, format="JPEG")
        receipt = (await client.post("/api/v1/receipts", files={"file": ("r.jpg", buf.getvalue(), "image/jpeg")})).json()
        async with scoped_session(uid) as db:
            assert await db.scalar(select(func.count()).select_from(StoredFile).where(StoredFile.user_id == uid)) == 1
        image = await client.get(f"/api/v1/receipts/{receipt['id']}/image")
        assert image.status_code == 200 and image.headers["content-type"] == "image/jpeg"
        pending = (await client.get("/api/v1/receipts")).json()
        assert [r["id"] for r in pending] == [receipt["id"]]
        assert (await client.delete(f"/api/v1/receipts/{receipt['id']}")).status_code == 204
        assert (await client.get("/api/v1/receipts")).json() == []
        await client.aclose()


async def test_cron_endpoint_requires_secret(anon):
    from pydantic import SecretStr

    with settings_override(cron_secret=None):
        assert (await anon.get("/api/v1/internal/jobs/run")).status_code == 401
    with settings_override(cron_secret=SecretStr("cron-test-secret")):
        assert (await anon.get("/api/v1/internal/jobs/run", headers={"authorization": "Bearer nope"})).status_code == 401
        r = await anon.get("/api/v1/internal/jobs/run", headers={"authorization": "Bearer cron-test-secret"})
        assert r.status_code == 200 and "processed" in r.json()


async def test_tags_endpoint(client):
    account = (await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash"})).json()
    await client.post("/api/v1/transactions", json={"type": "expense", "amount_minor": 100, "occurred_on": TODAY,
                                                    "account_id": account["id"], "tags": ["Work", "travel"]})
    assert [t["name"] for t in (await client.get("/api/v1/tags")).json()] == ["travel", "work"]
    assert (await client.get("/api/v1/transactions", params={"tag": "work"})).json()["total_count"] == 1
