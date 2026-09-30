"""Someone registers another person's email with a password before that person ever uses Faldo. When the real owner
later signs in with Google or Apple (which verify the email), the stranger must lose every way back in: their password
and their sessions. Accounts that already proved they own their email are joined as they are."""

import re
import uuid
from typing import Any

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select

from app.api.v1 import auth as auth_routes
from app.core.db import scoped_session
from app.models import OAuthIdentity, User
from app.services import oauth
from tests.conftest import ApiClient
from tests.test_oauth import _settings, _start, google  # noqa: F401  (google is a fixture)

PASSWORD = "stranger-password-1"


@pytest.fixture
def mailbox(monkeypatch):
    """Every email Faldo sends, by address."""
    sent: dict[str, list[str]] = {}

    async def fake_send(to: str, subject: str, text: str, html: str) -> bool:
        sent.setdefault(to.lower(), []).append(text)
        return True

    monkeypatch.setattr(auth_routes, "send_email", fake_send)
    return sent


def _link(mails: list[str], kind: str) -> str:
    found = re.search(rf"/{kind}/([A-Za-z0-9_\-]+)", mails[-1])
    assert found, mails[-1]
    return found.group(1)


def _client(app) -> ApiClient:
    return ApiClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def _register(app, email: str, name: str = "Stranger") -> ApiClient:
    client = _client(app)
    r = await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD, "display_name": name})
    assert r.status_code == 201, r.text
    assert r.json()["email_verified"] is False and r.json()["has_password"] is True
    return client


async def _google_sign_in(app, next_path: str = "/") -> tuple[ApiClient, httpx.Response]:
    client = _client(app)
    state = await _start(client, next_path)
    return client, await client.get("/api/v1/auth/google/callback", params={"code": "good-code", "state": state})


async def _password_login(app, email: str) -> int:
    async with _client(app) as client:
        return (await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})).status_code


async def test_a_stranger_who_registered_the_email_first_loses_access_when_the_owner_uses_google(app, google, mailbox):  # noqa: F811 (the google fixture)
    person, _ = google
    stranger = await _register(app, person["email"])
    stranger_id = (await stranger.get("/api/v1/me")).json()["id"]
    note = await stranger.post("/api/v1/notes", json={"content": "Rent is due on the 5th"})
    assert note.status_code == 201

    owner, r = await _google_sign_in(app, "/budgets?tab=food")
    assert r.status_code == 302
    assert r.headers["location"] == "/budgets?tab=food&notice=account-secured", "the owner is told what happened"

    me = (await owner.get("/api/v1/me")).json()
    assert me["id"] == stranger_id, "the account and its records stay"
    assert me["email_verified"] is True and me["has_password"] is False
    assert [n["content"] for n in (await owner.get("/api/v1/notes")).json()] == ["Rent is due on the 5th"]

    assert (await stranger.get("/api/v1/me")).status_code == 401, "the stranger's session is gone"
    assert await _password_login(app, person["email"]) == 401, "and so is their password"
    await stranger.aclose()
    await owner.aclose()


async def test_the_same_holds_for_sign_in_with_apple(app, monkeypatch, mailbox):
    who = uuid.uuid4().hex[:10]
    email = f"bea-{who}@example.com"
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    settings = _settings(apple_client_id="app.faldo.signin", apple_team_id="TEAM123456", apple_key_id="KEY1234567",
                         apple_private_key=pem)
    monkeypatch.setattr(oauth, "get_settings", lambda: settings)

    async def apple_identity(code: str, user: Any) -> oauth.Identity:
        assert code == "apple-code"
        return oauth.Identity(provider="apple", subject=f"a-{who}", email=email, email_verified=True, name="Bea")

    monkeypatch.setattr(oauth, "apple_identity", apple_identity)
    stranger = await _register(app, email)

    owner = _client(app)
    start = await owner.get("/api/v1/auth/apple/start")
    state = dict(httpx.URL(start.headers["location"]).params)["state"]
    r = await owner.post("/api/v1/auth/apple/callback", data={"code": "apple-code", "state": state})
    assert r.status_code == 302 and r.headers["location"] == "/?notice=account-secured"
    assert (await owner.get("/api/v1/me")).json()["email_verified"] is True
    assert (await stranger.get("/api/v1/me")).status_code == 401
    assert await _password_login(app, email) == 401
    await stranger.aclose()
    await owner.aclose()


async def test_a_returning_google_user_keeps_their_other_devices(app, google):  # noqa: F811 (the google fixture)
    phone, first = await _google_sign_in(app)
    assert first.headers["location"] == "/", "a brand new account has nothing to secure"
    laptop, again = await _google_sign_in(app)
    assert again.headers["location"] == "/"
    assert (await phone.get("/api/v1/me")).status_code == 200, "signing in again elsewhere signs nobody out"
    assert (await laptop.get("/api/v1/me")).json()["email_verified"] is True
    await phone.aclose()
    await laptop.aclose()


async def test_an_account_that_confirmed_its_email_is_joined_without_losing_its_password(app, google, mailbox):  # noqa: F811 (the google fixture)
    person, _ = google
    owner = await _register(app, person["email"], "Owner")
    token = _link(mailbox[person["email"].lower()], "verify-email")
    r = await owner.post("/api/v1/auth/email/verify", json={"token": token})
    assert r.status_code == 200 and r.json()["email_verified"] is True

    google_client, r = await _google_sign_in(app)
    assert r.headers["location"] == "/", "nothing was taken away, so there's nothing to tell"
    assert (await google_client.get("/api/v1/me")).json()["id"] == (await owner.get("/api/v1/me")).json()["id"]
    assert (await owner.get("/api/v1/me")).status_code == 200, "their own session stays"
    assert await _password_login(app, person["email"]) == 200, "and their password still works"
    await owner.aclose()
    await google_client.aclose()


async def test_a_confirmation_link_only_counts_for_the_account_it_was_sent_to(app, anon, mailbox):
    email = f"target-{uuid.uuid4().hex[:10]}@example.com"
    stranger = await _register(app, email)
    token = _link(mailbox[email], "verify-email")

    # The email's real owner clicks the link without the stranger's password: nothing is confirmed.
    assert (await anon.post("/api/v1/auth/email/verify", json={"token": token})).status_code == 401
    someone_else = await _register(app, f"other-{uuid.uuid4().hex[:10]}@example.com", "Other")
    r = await someone_else.post("/api/v1/auth/email/verify", json={"token": token})
    assert r.status_code == 400, r.text
    assert (await someone_else.get("/api/v1/me")).json()["email_verified"] is False
    assert (await stranger.get("/api/v1/me")).json()["email_verified"] is False

    # Asking again replaces the link; the old one no longer works even for the right account.
    assert (await stranger.post("/api/v1/auth/email/resend")).status_code == 204
    assert (await stranger.post("/api/v1/auth/email/verify", json={"token": token})).status_code == 400
    fresh = _link(mailbox[email], "verify-email")
    assert (await stranger.post("/api/v1/auth/email/verify", json={"token": fresh})).json()["email_verified"] is True
    await stranger.aclose()
    await someone_else.aclose()


async def test_resetting_the_password_through_the_inbox_confirms_the_email(app, anon, mailbox):
    email = f"reset-{uuid.uuid4().hex[:10]}@example.com"
    first = await _register(app, email)
    await anon.post("/api/v1/auth/password/forgot", json={"email": email})
    token = _link(mailbox[email], "reset-password")
    r = await anon.post("/api/v1/auth/password/reset", json={"token": token, "password": "a-brand-new-password"})
    assert r.status_code == 200 and r.json()["email_verified"] is True
    assert (await first.get("/api/v1/me")).status_code == 401, "a reset still signs every other device out"
    await first.aclose()


async def test_a_link_made_before_confirmation_existed_is_secured_on_the_next_sign_in(app, google, mailbox):  # noqa: F811 (the google fixture)
    """Accounts joined by the old rule (a password nobody confirmed, then Google) get secured the next time."""
    person, _ = google
    stranger = await _register(app, person["email"])
    user_id = uuid.UUID((await stranger.get("/api/v1/me")).json()["id"])
    async with scoped_session(user_id) as db:
        db.add(OAuthIdentity(user_id=user_id, provider="google", subject=person["sub"], email=person["email"]))
        assert (await db.scalar(select(User.email_verified_at).where(User.id == user_id))) is None

    owner, r = await _google_sign_in(app)
    assert r.headers["location"] == "/?notice=account-secured"
    assert (await stranger.get("/api/v1/me")).status_code == 401
    assert await _password_login(app, person["email"]) == 401
    again, r = await _google_sign_in(app)
    assert r.headers["location"] == "/", "only once"
    assert (await owner.get("/api/v1/me")).status_code == 200
    await stranger.aclose()
    await owner.aclose()
    await again.aclose()
