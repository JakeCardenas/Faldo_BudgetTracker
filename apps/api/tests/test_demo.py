"""Trying Faldo without signing up (services/demo.py), and agreeing to the Privacy notice and Terms (POLICY_VERSION)."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select, update

from app.ai import usage
from app.api.v1 import auth as auth_routes
from app.core.config import get_settings
from app.core.db import scoped_session
from app.models import Account, Transaction, User
from app.services import demo as demo_service
from tests.conftest import ApiClient, make_user

POLICY = "2026-10-15"


def configure(monkeypatch, **update):
    settings = get_settings().model_copy(update=update)
    for module in (auth_routes, demo_service, usage):
        monkeypatch.setattr(module, "get_settings", lambda: settings)


def visitor(app) -> ApiClient:
    return ApiClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def start(app) -> tuple[ApiClient, dict, httpx.Response]:
    client = visitor(app)
    response = await client.post("/api/v1/auth/demo")
    assert response.status_code == 201, response.text
    return client, response.json(), response


async def count(model, user_id: uuid.UUID) -> int:
    async with scoped_session(user_id) as db:
        return int(await db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) or 0)


async def exists(user_id: uuid.UUID) -> bool:
    async with scoped_session(None) as db:
        return await db.scalar(select(User.id).where(User.id == user_id)) is not None


async def test_each_visitor_gets_a_sandbox_of_their_own_with_sample_data(app):
    first, me, response = await start(app)
    second, other, _ = await start(app)
    assert me["is_demo"] and other["is_demo"] and me["id"] != other["id"]
    assert me["display_name"] == "Bea" and me["has_password"] is False
    assert me["settings"]["onboarding_completed_at"], "the demo opens on Home, not on setup"
    ends = datetime.fromisoformat(me["demo_expires_at"])
    assert timedelta(hours=23) < ends - datetime.now(UTC) <= timedelta(hours=24)
    # The session cookie ends with the browser, and nothing about it can be shared to sign in elsewhere.
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "max-age" not in cookie and "expires" not in cookie

    accounts = (await first.get("/api/v1/accounts")).json()
    assert len(accounts) == 6
    assert await count(Transaction, uuid.UUID(me["id"])) > 100
    # Nothing in one sandbox can be seen or changed from another.
    assert (await second.get(f"/api/v1/accounts/{accounts[0]['id']}")).status_code == 404
    spent = await first.post("/api/v1/transactions", json={"type": "expense", "amount_minor": 12_300,
                                                           "account_id": accounts[0]["id"], "occurred_on": "2026-09-30"})
    assert spent.status_code == 201, spent.text
    assert await count(Transaction, uuid.UUID(other["id"])) == await count(Transaction, uuid.UUID(me["id"])) - 1
    await first.aclose()
    await second.aclose()


async def test_a_demo_stops_working_at_its_end_time_and_is_then_deleted(app):
    client, me, _ = await start(app)
    user_id = uuid.UUID(me["id"])
    async with scoped_session(None) as db:
        await db.execute(update(User).where(User.id == user_id).values(demo_expires_at=datetime.now(UTC) - timedelta(minutes=1)))
    refused = await client.get("/api/v1/me")
    assert refused.status_code == 401 and "demo has ended" in refused.json()["detail"]
    assert refused.json()["type"] == "urn:faldo:problem:demo-ended"

    async with scoped_session(None) as db:
        assert await demo_service.purge_expired(db) >= 1
    assert not await exists(user_id)
    assert await count(Account, user_id) == 0, "everything in the sandbox goes with it"
    await client.aclose()


async def test_signing_out_of_a_demo_deletes_it_but_signing_out_of_an_account_does_not(app):
    client, me, _ = await start(app)
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    assert not await exists(uuid.UUID(me["id"]))

    person = await make_user(app, "Real")
    mine = (await person.get("/api/v1/me")).json()
    assert mine["is_demo"] is False and mine["demo_expires_at"] is None
    assert (await person.post("/api/v1/auth/logout")).status_code == 204
    assert await exists(uuid.UUID(mine["id"]))
    async with scoped_session(None) as db:
        await demo_service.purge_expired(db)
    assert await exists(uuid.UUID(mine["id"])), "only demo sandboxes are ever purged"
    await client.aclose()
    await person.aclose()


async def test_demo_starts_are_limited_per_visitor_and_overall(app, monkeypatch):
    configure(monkeypatch, demo_starts_per_ip_per_hour=2)
    for _ in range(2):
        await start(app)
    assert (await visitor(app).post("/api/v1/auth/demo")).status_code == 429

    from app.core.rate_limit import limiter

    limiter.reset()
    async with scoped_session(None) as db:
        active = await demo_service.active_count(db)
    configure(monkeypatch, demo_max_active=active)
    full = await visitor(app).post("/api/v1/auth/demo")
    assert full.status_code == 503 and "create an account" in full.json()["detail"]


async def test_the_demo_can_be_turned_off(app, anon, monkeypatch):
    assert (await anon.get("/api/v1/auth/providers")).json()["demo"] is True
    configure(monkeypatch, demo_enabled=False)
    assert (await anon.get("/api/v1/auth/providers")).json()["demo"] is False
    assert (await anon.post("/api/v1/auth/demo")).status_code == 404


async def test_a_demo_cannot_store_files_or_send_email_and_gets_less_ai(app):
    client, me, _ = await start(app)
    receipt = await client.post("/api/v1/receipts", files={"file": ("r.jpg", b"\xff\xd8\xff" + b"0" * 64, "image/jpeg")})
    assert receipt.status_code == 403 and "isn't available in the demo" in receipt.json()["detail"]
    restore = await client.post("/api/v1/me/backup/preview", files={"file": ("b.json", b"{}", "application/json")})
    assert restore.status_code == 403 and "Restoring a backup" in restore.json()["detail"]
    assert (await client.post("/api/v1/auth/email/resend")).status_code == 403

    assert await usage.daily_limit(uuid.UUID(me["id"])) == get_settings().ai_demo_daily_calls
    person = await make_user(app, "Real")
    assert await usage.daily_limit(uuid.UUID((await person.get("/api/v1/me")).json()["id"])) == get_settings().ai_user_daily_calls
    await client.aclose()
    await person.aclose()


async def test_the_demo_ai_allowance_runs_out_sooner(app, monkeypatch):
    client, me, _ = await start(app)
    settings = get_settings().model_copy(update={"ai_demo_daily_calls": 2, "ai_user_daily_calls": 50})
    monkeypatch.setattr(usage, "get_settings", lambda: settings)
    user_id = uuid.UUID(me["id"])
    await usage.charge(user_id, "chat")
    await usage.charge(user_id, "chat")
    with pytest.raises(usage.AIBudgetExceeded):
        await usage.charge(user_id, "chat")
    await client.aclose()


async def _register(anon, **extra):
    email = f"policy-{uuid.uuid4().hex[:10]}@example.com"
    return await anon.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse-battery",
                                                          "display_name": "Ana", **extra})


async def _accepted(user_id: str) -> tuple[str | None, datetime | None]:
    async with scoped_session(None) as db:
        user = await db.get(User, uuid.UUID(user_id))
        assert user is not None
        return user.policy_version, user.policy_accepted_at


async def test_without_an_approved_policy_nothing_is_recorded(app, anon):
    assert (await anon.get("/api/v1/auth/policy")).json() == {"version": None}
    response = await _register(anon, accepted_policy_version="draft")
    assert response.status_code == 201, response.text
    assert response.json()["policy_to_accept"] is None
    assert await _accepted(response.json()["id"]) == (None, None)
    assert (await anon.post("/api/v1/me/policy", json={"version": "draft"})).status_code == 409


async def test_with_an_approved_policy_sign_up_needs_that_exact_version(app, anon, monkeypatch):
    configure(monkeypatch, policy_version=POLICY)
    assert (await anon.get("/api/v1/auth/policy")).json() == {"version": POLICY}
    assert (await _register(anon)).status_code == 400
    assert (await _register(anon, accepted_policy_version="2026-01-01")).status_code == 400

    response = await _register(anon, accepted_policy_version=POLICY)
    assert response.status_code == 201, response.text
    assert response.json()["policy_to_accept"] is None
    version, at = await _accepted(response.json()["id"])
    assert version == POLICY and at is not None and datetime.now(UTC) - at < timedelta(minutes=1)


async def test_existing_accounts_are_asked_once_for_a_new_approved_version(app, monkeypatch):
    person = await make_user(app, "Before")
    configure(monkeypatch, policy_version=POLICY)
    me = (await person.get("/api/v1/me")).json()
    assert me["policy_to_accept"] == POLICY
    assert (await person.post("/api/v1/me/policy", json={"version": "2026-01-01"})).status_code == 409
    accepted = await person.post("/api/v1/me/policy", json={"version": POLICY})
    assert accepted.status_code == 200 and accepted.json()["policy_to_accept"] is None
    assert (await _accepted(me["id"]))[0] == POLICY
    await person.aclose()
