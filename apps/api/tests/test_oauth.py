"""Sign in with Google (and Apple): the round trip, new and existing people, and the checks that keep it safe."""

import base64
import json
import time
import uuid
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from app.core.config import Settings, get_settings
from app.services import oauth
from tests.conftest import ApiClient, make_user

APP_URL = "https://faldo.example"


def _settings(**extra: Any) -> Settings:
    base = get_settings().model_dump()
    base.update(public_app_url=APP_URL, google_client_id="gid.apps.googleusercontent.com", google_client_secret="g-secret", **extra)
    return Settings(**base)


@pytest.fixture
def google(monkeypatch):
    """Google's token and userinfo endpoints, answering for whoever the test says signed in."""
    who = uuid.uuid4().hex[:10]  # each test its own Google person; the test database is shared
    person: dict[str, Any] = {"sub": f"g-{who}", "email": f"ana.cruz-{who}@example.com", "email_verified": True, "name": "Ana Cruz"}
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url == httpx.URL(oauth.GOOGLE_TOKEN):
            form = parse_qs(request.content.decode())
            if form.get("code") != ["good-code"]:
                return httpx.Response(400, json={"error": "invalid_grant"})
            assert form["redirect_uri"] == [f"{APP_URL}/api/v1/auth/google/callback"] and form["client_secret"] == ["g-secret"]
            return httpx.Response(200, json={"access_token": "g-access", "token_type": "Bearer"})
        assert request.headers["authorization"] == "Bearer g-access"
        return httpx.Response(200, json=person)

    monkeypatch.setattr(oauth, "get_settings", lambda: _settings())
    monkeypatch.setattr(oauth, "_http", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    return person, seen


async def _start(client: httpx.AsyncClient, next_path: str = "/") -> str:
    r = await client.get("/api/v1/auth/google/start", params={"next": next_path})
    assert r.status_code == 302, r.text
    url = urlparse(r.headers["location"])
    assert url.netloc == "accounts.google.com"
    query = parse_qs(url.query)
    assert query["client_id"] == ["gid.apps.googleusercontent.com"] and query["scope"] == ["openid email profile"]
    assert query["redirect_uri"] == [f"{APP_URL}/api/v1/auth/google/callback"]
    return query["state"][0]


async def test_the_buttons_show_only_for_what_is_set_up(anon, monkeypatch):
    assert (await anon.get("/api/v1/auth/providers")).json() == {"google": False, "apple": False}
    monkeypatch.setattr(oauth, "get_settings", lambda: _settings())
    assert (await anon.get("/api/v1/auth/providers")).json() == {"google": True, "apple": False}
    assert (await anon.get("/api/v1/auth/apple/start")).headers["location"] == "/login?error=unavailable"


async def test_a_new_person_signs_up_with_google_and_lands_where_they_were_going(anon, google):
    person, _ = google
    state = await _start(anon, "/budgets")
    r = await anon.get("/api/v1/auth/google/callback", params={"code": "good-code", "state": state})
    assert r.status_code == 302 and r.headers["location"] == "/budgets"
    me = (await anon.get("/api/v1/me")).json()
    assert me["email"] == person["email"] and me["display_name"] == "Ana Cruz"
    assert me["settings"]["onboarding_completed_at"] is None, "new people go through onboarding"


async def test_google_signs_into_the_existing_account_with_that_email(app, google):
    person, _ = google
    existing = await make_user(app, "Existing")
    me = (await existing.get("/api/v1/me")).json()
    person["email"] = me["email"]
    async with ApiClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        state = await _start(client)
        r = await client.get("/api/v1/auth/google/callback", params={"code": "good-code", "state": state})
        assert (await client.get("/api/v1/me")).json()["id"] == me["id"]
        # The password sign-up never confirmed its email, so Google's verified email takes the account over.
        assert r.headers["location"] == "/?notice=account-secured"
        assert (await existing.get("/api/v1/me")).status_code == 401
        # Later the person changes their Gmail address: the Google account still signs into the same Faldo account.
        person["email"] = f"new-{person['sub']}@example.com"
        await client.post("/api/v1/auth/logout")
        state = await _start(client)
        await client.get("/api/v1/auth/google/callback", params={"code": "good-code", "state": state})
        assert (await client.get("/api/v1/me")).json()["id"] == me["id"]
    await existing.aclose()


async def test_a_forged_or_expired_return_is_refused(anon, google):
    _, seen = google
    await _start(anon)
    r = await anon.get("/api/v1/auth/google/callback", params={"code": "good-code", "state": "someone-elses-state"})
    assert r.headers["location"] == "/login?error=expired" and not seen, "nothing is asked of Google"
    assert (await anon.get("/api/v1/me")).status_code == 401


async def test_an_unverified_email_is_not_trusted(anon, google):
    person, _ = google
    person["email_verified"] = False
    state = await _start(anon)
    r = await anon.get("/api/v1/auth/google/callback", params={"code": "good-code", "state": state})
    assert r.headers["location"] == "/login?error=unverified"
    assert (await anon.get("/api/v1/me")).status_code == 401


async def test_cancelling_at_google_or_a_failed_exchange_comes_back_to_login(anon, google):
    state = await _start(anon)
    r = await anon.get("/api/v1/auth/google/callback", params={"error": "access_denied", "state": state})
    assert r.headers["location"] == "/login?error=cancelled"
    state = await _start(anon)
    r = await anon.get("/api/v1/auth/google/callback", params={"code": "bad-code", "state": state})
    assert r.headers["location"] == "/login?error=google"


async def test_only_paths_inside_faldo_are_followed_after_signing_in(anon, google):
    state = await _start(anon, "//evil.example/steal")
    r = await anon.get("/api/v1/auth/google/callback", params={"code": "good-code", "state": state})
    assert r.headers["location"] == "/"


def _b64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def test_the_apple_client_secret_is_signed_with_the_apple_key():
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    settings = _settings(apple_client_id="app.faldo.signin", apple_team_id="TEAM123456", apple_key_id="KEY1234567", apple_private_key=pem)
    token = oauth.apple_client_secret(settings, now=1_790_000_000)
    header, payload, signature = token.split(".")
    assert json.loads(_b64(header)) == {"alg": "ES256", "kid": "KEY1234567"}
    claims = json.loads(_b64(payload))
    assert claims["iss"] == "TEAM123456" and claims["sub"] == "app.faldo.signin" and claims["aud"] == "https://appleid.apple.com"
    assert 0 < claims["exp"] - claims["iat"] <= 180 * 86400
    raw = _b64(signature)
    der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
    key.public_key().verify(der, f"{header}.{payload}".encode(), ec.ECDSA(hashes.SHA256()))  # raises if it doesn't match


def test_an_apple_id_token_is_checked_before_it_is_believed():
    settings = _settings(apple_client_id="app.faldo.signin")
    now = int(time.time())

    def token(**claims: Any) -> str:
        body = {"iss": "https://appleid.apple.com", "aud": "app.faldo.signin", "exp": now + 600, "sub": "a-1",
                "email": "x@privaterelay.appleid.com", "email_verified": "true", **claims}
        encoded = base64.urlsafe_b64encode(json.dumps(body).encode()).decode().rstrip("=")
        return f"e30.{encoded}.sig"

    identity = oauth.apple_claims(token(), settings, {"name": {"firstName": "Bea", "lastName": "Santos"}})
    assert identity.subject == "a-1" and identity.email_verified and identity.name == "Bea Santos"
    for bad in (token(aud="someone.else"), token(iss="https://evil.example"), token(exp=now - 5)):
        with pytest.raises(oauth.SignInError):
            oauth.apple_claims(bad, settings, None)
