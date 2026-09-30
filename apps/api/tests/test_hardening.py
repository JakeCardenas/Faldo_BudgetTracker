"""Security hardening: which client addresses are believed, push endpoints, a recent sign-in before sensitive actions,
row-level security coverage, secrets kept out of logs, and the CSP report endpoint."""

import io
import logging
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from pydantic import SecretStr
from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError
from starlette.requests import Request

from app.core import client_ip as client_ip_module
from app.core.client_ip import client_ip
from app.core.config import get_settings
from app.core.db import build_engine, scoped_session
from app.core.logging import RedactingFilter, RedactingFormatter
from app.models import OAuthIdentity, PushSubscription, Session, Tag, Transaction, transaction_tags
from app.services import push
from tests.conftest import make_user


def _request(headers: dict[str, str], peer: str = "203.0.113.9") -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "client": (peer, 1234),
                    "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]})


def _settings(monkeypatch, **update: Any) -> None:
    settings = get_settings().model_copy(update=update)
    monkeypatch.setattr(client_ip_module, "get_settings", lambda: settings)


def test_forwarding_headers_from_a_caller_are_not_believed_off_platform(monkeypatch):
    _settings(monkeypatch, trust_proxy_headers=False, proxy_shared_secret=None)
    forged = _request({"x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4", "x-faldo-client-ip": "1.2.3.4"})
    assert client_ip(forged) == "203.0.113.9"


def test_the_web_proxy_address_needs_the_shared_secret(monkeypatch):
    _settings(monkeypatch, trust_proxy_headers=True, proxy_shared_secret=SecretStr("s3cret-shared-value"))
    platform = {"x-vercel-forwarded-for": "198.51.100.7"}
    assert client_ip(_request({**platform, "x-faldo-client-ip": "192.0.2.44", "x-faldo-proxy-auth": "s3cret-shared-value"})) == "192.0.2.44"
    assert client_ip(_request({**platform, "x-faldo-client-ip": "192.0.2.44", "x-faldo-proxy-auth": "guess"})) == "198.51.100.7"
    assert client_ip(_request({**platform, "x-faldo-client-ip": "192.0.2.44"})) == "198.51.100.7", "no secret, no trust"
    assert client_ip(_request({**platform, "x-faldo-client-ip": "not-an-ip", "x-faldo-proxy-auth": "s3cret-shared-value"})) == "198.51.100.7"


def test_on_vercel_the_platform_header_is_used(monkeypatch):
    _settings(monkeypatch, trust_proxy_headers=True, proxy_shared_secret=None)
    assert client_ip(_request({"x-vercel-forwarded-for": "198.51.100.7, 10.0.0.1", "x-faldo-client-ip": "1.2.3.4"})) == "198.51.100.7"


GOOD = ["https://fcm.googleapis.com/fcm/send/abc123", "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://web.push.apple.com/QGx", "https://wns2-sg2p.notify.windows.com/w/?token=abc"]
BAD = ["http://fcm.googleapis.com/fcm/send/abc", "https://127.0.0.1/fcm/send", "https://localhost/push", "https://10.0.0.5/x",
       "https://169.254.169.254/latest/meta-data", "https://[::1]/x", "https://fcm.googleapis.com.evil.example/x",
       "https://evil.example/fcm.googleapis.com", "https://user:pass@fcm.googleapis.com/x",
       "https://fcm.googleapis.com:8443/x", "https://internal.corp/push", "https://0x7f000001/x"]


@pytest.mark.parametrize("url", GOOD)
def test_real_push_services_are_accepted(url: str):
    assert push.valid_endpoint(url)


@pytest.mark.parametrize("url", BAD)
def test_other_addresses_are_refused(url: str):
    assert not push.valid_endpoint(url)


async def test_the_server_never_contacts_a_bad_push_address(app, monkeypatch):
    client = await make_user(app, "Pusher")
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    keys = {"p256dh": "B" * 40, "auth": "A" * 16}
    for url in BAD[1:]:
        r = await client.post("/api/v1/push/subscriptions", json={"endpoint": url + "/pad-to-length", "keys": keys})
        assert r.status_code == 422, url
    assert (await client.post("/api/v1/push/subscriptions", json={"endpoint": GOOD[0], "keys": keys})).status_code == 204

    # A row saved before this check existed, pointing inside the network: it's dropped, never requested.
    async with scoped_session(uid) as db:
        db.add(PushSubscription(user_id=uid, endpoint=f"https://169.254.169.254/{uuid.uuid4().hex}", p256dh="B" * 40, auth="A" * 16))
    contacted: list[str] = []
    import pywebpush

    def fake_webpush(subscription_info: dict[str, Any], **kwargs: Any) -> Any:
        contacted.append(subscription_info["endpoint"])
        return type("Sent", (), {"status_code": 201})()

    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    monkeypatch.setattr(push, "_private_pem", _fake_pem)
    await push.send_to_user(uid, {"title": "t", "body": "b"})
    assert contacted == [GOOD[0]]
    async with scoped_session(uid) as db:
        left = (await db.execute(select(PushSubscription.endpoint).where(PushSubscription.user_id == uid))).scalars().all()
    assert left == [GOOD[0]], "the bad address was removed"
    await client.aclose()


async def _fake_pem(session: Any) -> str:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    return key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()


async def _age_session(uid: uuid.UUID) -> None:
    async with scoped_session(uid) as db:
        await db.execute(update(Session).where(Session.user_id == uid)
                         .values(reauthenticated_at=datetime.now(UTC) - timedelta(hours=1)))


async def test_sensitive_actions_need_a_recent_sign_in(app):
    client = await make_user(app, "Careful")
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    assert (await client.get("/api/v1/me/export")).status_code == 200, "just signed in counts"

    await _age_session(uid)
    for method, path in (("GET", "/api/v1/me/export"), ("GET", "/api/v1/me/backup"), ("DELETE", "/api/v1/me")):
        r = await client.request(method, path)
        assert r.status_code == 403, path
        assert r.json()["type"] == "urn:faldo:problem:reauthentication-required" and r.json()["methods"] == ["password"]
    assert (await client.get("/api/v1/me")).status_code == 200, "the account is still there"

    assert (await client.post("/api/v1/auth/reauthenticate", json={"password": "wrong-password"})).status_code == 400
    assert (await client.post("/api/v1/auth/reauthenticate", json={"password": "correct-horse-battery"})).status_code == 204
    assert (await client.get("/api/v1/me/export")).status_code == 200
    await client.aclose()


async def test_accounts_without_a_password_confirm_with_their_provider(app):
    client = await make_user(app, "Googler")
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    async with scoped_session(uid) as db:
        from app.models import User

        user = await db.get(User, uid)
        assert user is not None
        user.password_hash = None
        db.add(OAuthIdentity(user_id=uid, provider="google", subject=f"g-{uid}", email=user.email))
    await _age_session(uid)
    r = await client.get("/api/v1/me/export")
    assert r.status_code == 403 and r.json()["methods"] == ["google"]
    assert (await client.post("/api/v1/auth/reauthenticate", json={"password": "anything"})).status_code == 400
    await client.aclose()


async def test_confirming_with_a_password_is_rate_limited(app):
    client = await make_user(app, "Guesser")
    codes = [(await client.post("/api/v1/auth/reauthenticate", json={"password": f"guess-{i}"})).status_code for i in range(11)]
    assert codes[:10] == [400] * 10 and codes[10] == 429
    await client.aclose()


# Tables that hold no one person's data, or must be read before anyone is signed in (see README, Database).
NO_RLS = {"alembic_version", "app_keys", "auth_tokens", "jobs", "oauth_identities", "push_subscriptions", "rate_limit_hits",
          "sessions", "users"}


async def test_every_other_table_enforces_row_level_security(app):
    async with scoped_session(None) as db:
        rows = (await db.execute(text(
            "SELECT relname, relrowsecurity AND relforcerowsecurity FROM pg_class "
            "WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace"))).all()
    without = {name for name, protected in rows if not protected}
    assert without == NO_RLS, "a new table needs row-level security, or a reason to be listed in NO_RLS"


async def test_transaction_tags_are_only_visible_and_writable_by_their_owner(app):
    owner = await make_user(app, "Tagger")
    other = await make_user(app, "Snoop")
    account = (await owner.post("/api/v1/accounts", json={"name": "Cash", "type": "cash"})).json()
    txn = (await owner.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 1_000, "occurred_on": "2026-09-01", "account_id": account["id"], "tags": ["secret-trip"]})).json()
    other_id = uuid.UUID((await other.get("/api/v1/me")).json()["id"])
    await other.post("/api/v1/transactions", json={"type": "expense", "amount_minor": 1, "occurred_on": "2026-09-01",
                                                   "account_id": (await other.post("/api/v1/accounts", json={"name": "Cash", "type": "cash"})).json()["id"],
                                                   "tags": ["mine"]})
    async with scoped_session(other_id) as db:
        seen = (await db.execute(select(transaction_tags).where(transaction_tags.c.transaction_id == uuid.UUID(txn["id"])))).all()
        assert seen == []
        my_tag = (await db.execute(select(Tag.id).where(Tag.user_id == other_id))).scalar_one()
    with pytest.raises(DBAPIError):
        async with scoped_session(other_id) as db:
            await db.execute(transaction_tags.insert().values(transaction_id=uuid.UUID(txn["id"]), tag_id=my_tag))
    owner_id = uuid.UUID((await owner.get("/api/v1/me")).json()["id"])
    async with scoped_session(owner_id) as db:
        assert (await db.execute(select(Transaction.id))).scalars().all()
        assert len((await db.execute(select(transaction_tags))).all()) == 1
    await owner.aclose()
    await other.aclose()


def test_secrets_and_personal_details_are_scrubbed_from_log_lines_and_tracebacks():
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(RedactingFormatter("%(message)s"))
    handler.addFilter(RedactingFilter())
    log = logging.getLogger("test.redaction")
    log.addHandler(handler)
    log.propagate = False
    try:
        raise RuntimeError("connect to postgresql://faldo_app.ref:hunter2hunter2@db.example:6543/postgres failed for "
                           "ana@example.com with Authorization: Bearer abcdefghijklmnop and key AIzaSyA1234567890abcdefghijklmnopq")
    except RuntimeError:
        log.exception("Request failed; cookie faldo_session=abc123def456 token=zzz")
    finally:
        log.removeHandler(handler)
    out = stream.getvalue()
    for secret in ("hunter2hunter2", "ana@example.com", "abcdefghijklmnop", "AIzaSyA1234567890", "abc123def456", "token=zzz"):
        assert secret not in out, secret
    assert "RuntimeError" in out, "the traceback itself is kept"


async def test_database_errors_never_log_the_values_sent():
    engine = build_engine(os.environ["DATABASE_URL"])
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(RedactingFormatter("%(message)s"))
    log = logging.getLogger("test.sql")
    log.addHandler(handler)
    log.propagate = False
    try:
        async with engine.connect() as conn:
            for statement, value in (("SELECT CAST(:value AS integer)", "Rent for Maria 5000"),
                                     ("SELECT CAST(:value AS uuid)", "Maria owes 1200")):
                with pytest.raises(DBAPIError) as failure:
                    await conn.execute(text(statement), {"value": value})
                assert "parameters hidden" in str(failure.value), "SQLAlchemy never prints the parameters"
                log.error("Query failed", exc_info=failure.value)
    finally:
        log.removeHandler(handler)
        await engine.dispose()
    out = stream.getvalue()
    assert "Maria" not in out and "5000" not in out and "1200" not in out
    assert "[SQL: SELECT CAST($1 AS integer)]" in out, "the statement itself is still there to debug with"


def test_database_messages_that_quote_values_are_scrubbed():
    from app.core.logging import redact

    assert "maria" not in redact('duplicate key value violates unique constraint "uq_users_email"\n'
                                 "DETAIL:  Key (email)=(maria@x.example) already exists.").lower()
    assert "Rent" not in redact("DETAIL:  Failing row contains (1, Rent for Maria, 5000).")


async def test_csp_reports_are_accepted_from_the_browser_and_logged_briefly(anon, caplog):
    report = {"csp-report": {"violated-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?user=ana@example.com",
                             "document-uri": "https://faldo.example/transactions?q=secret"}}
    with caplog.at_level(logging.WARNING, logger="faldo.csp"):
        r = await anon.post("/api/v1/security/csp-report", content=__import__("json").dumps(report),
                            headers={"content-type": "application/csp-report", "x-faldo-client": ""})
    assert r.status_code == 204
    line = " ".join(record.getMessage() for record in caplog.records)
    assert "script-src-elem" in line and "https://evil.example" in line
    assert "ana@example.com" not in line and "secret" not in line


def test_uvicorns_own_log_formats_keep_working_after_redaction_is_added():
    from uvicorn.logging import AccessFormatter, DefaultFormatter

    from app.core.logging import configure_logging

    stream = io.StringIO()
    access = logging.getLogger("uvicorn.access")
    error = logging.getLogger("uvicorn.error")
    saved = (access.handlers[:], error.handlers[:], logging.getLogger().handlers[:], logging.getLogger().level)
    access_handler, error_handler = logging.StreamHandler(stream), logging.StreamHandler(stream)
    access_handler.setFormatter(AccessFormatter('%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s'))
    error_handler.setFormatter(DefaultFormatter("%(levelprefix)s %(message)s"))
    access.handlers, error.handlers = [access_handler], [error_handler]
    try:
        configure_logging()
        access.info('%s - "%s %s HTTP/%s" %d', "::1:0", "GET", "/api/v1/me?token=abc123secret", "1.1", 200)
        error.info("Started for ana@example.com")
    finally:
        access.handlers, error.handlers, logging.getLogger().handlers = saved[0], saved[1], saved[2]
        logging.getLogger().setLevel(saved[3])
    out = stream.getvalue()
    assert '"GET /api/v1/me?token=[redacted] HTTP/1.1" 200' in out and "abc123secret" not in out
    assert "Started for [redacted-email]" in out
