"""Sign in with Google or Apple: OpenID Connect's authorization code flow, done on the server.

The browser goes to the service with a one-time `state` that Faldo also keeps in a short-lived cookie; the service sends
the person back with a code, and Faldo trades the code for who they are, straight from the service over TLS (so that
answer can be believed without checking a token signature). A returning account is found by the service's own id for
the person, which survives a changed email; a first sign-in joins the Faldo account with that verified email, or makes
one. Google is free to set up; Apple needs the Apple Developer Program, so its button only shows once it's configured.
"""

import base64
import json
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, unquote, urlencode

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import set_user_scope
from app.models import OAuthIdentity, User, UserSettings
from app.services.categories import create_default_categories

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo"
APPLE_AUTH = "https://appleid.apple.com/auth/authorize"
APPLE_TOKEN = "https://appleid.apple.com/auth/token"
APPLE_ISSUER = "https://appleid.apple.com"
PROVIDERS = ("google", "apple")
STATE_COOKIE = "faldo_oauth"
STATE_SECONDS = 10 * 60


class SignInError(Exception):
    """Why a sign-in didn't finish, as the code the login page explains (/login?error=code)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class Identity:
    provider: str
    subject: str
    email: str | None
    email_verified: bool
    name: str | None


def _http() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0))


def enabled(provider: str, settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    return {"google": settings.google_sign_in, "apple": settings.apple_sign_in}.get(provider, False)


def redirect_uri(provider: str, settings: Settings) -> str:
    return f"{settings.public_app_url.rstrip('/')}/api/v1/auth/{provider}/callback"


def safe_next(value: str | None) -> str:
    """Only a path inside Faldo: never another site (//evil.example, /\\evil.example, https://…)."""
    if not value or not value.startswith("/") or value.startswith(("//", "/\\")):
        return "/"
    return value[:300]


def new_state(provider: str, next_path: str) -> tuple[str, str]:
    """The one-time state for the service, and the cookie value that remembers it with where to go after."""
    state = secrets.token_urlsafe(24)
    return state, f"{provider}|{state}|{quote(safe_next(next_path), safe='')}|{int(time.time())}"


def check_state(provider: str, state: str | None, cookie: str | None) -> str:
    """Where to go after signing in, if the state the service returned is the one this browser was given."""
    try:
        kept_provider, kept_state, next_path, issued = (cookie or "").split("|")
        fresh = time.time() - int(issued) < STATE_SECONDS
    except ValueError:
        raise SignInError("expired") from None
    if kept_provider != provider or not state or not fresh or not secrets.compare_digest(kept_state, state):
        raise SignInError("expired")
    return safe_next(unquote(next_path))


def authorize_url(provider: str, state: str, settings: Settings) -> str:
    if provider == "google":
        params = {"client_id": settings.google_client_id or "", "redirect_uri": redirect_uri("google", settings),
                  "response_type": "code", "scope": "openid email profile", "state": state, "prompt": "select_account"}
        return f"{GOOGLE_AUTH}?{urlencode(params)}"
    # Apple sends the person back by POST (form_post) when asked for their name and email.
    params = {"client_id": settings.apple_client_id or "", "redirect_uri": redirect_uri("apple", settings),
              "response_type": "code", "scope": "name email", "response_mode": "form_post", "state": state}
    return f"{APPLE_AUTH}?{urlencode(params)}"


async def google_identity(code: str) -> Identity:
    settings = get_settings()
    secret = settings.google_client_secret.get_secret_value() if settings.google_client_secret else ""
    async with _http() as http:
        try:
            token = await http.post(GOOGLE_TOKEN, data={
                "code": code, "client_id": settings.google_client_id, "client_secret": secret,
                "redirect_uri": redirect_uri("google", settings), "grant_type": "authorization_code"})
            if token.status_code != 200 or not token.json().get("access_token"):
                raise SignInError("google")
            info = await http.get(GOOGLE_USERINFO, headers={"authorization": f"Bearer {token.json()['access_token']}"})
        except httpx.HTTPError as exc:
            raise SignInError("google") from exc
    if info.status_code != 200 or not info.json().get("sub"):
        raise SignInError("google")
    person = info.json()
    return Identity(provider="google", subject=str(person["sub"]), email=person.get("email"),
                    email_verified=person.get("email_verified") is True, name=person.get("name"))


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def apple_client_secret(settings: Settings, now: int | None = None) -> str:
    """Apple's client secret: a short JWT signed with the Sign in with Apple key (ES256)."""
    issued = int(now if now is not None else time.time())
    header = {"alg": "ES256", "kid": settings.apple_key_id}
    claims = {"iss": settings.apple_team_id, "iat": issued, "exp": issued + 30 * 86400, "aud": APPLE_ISSUER,
              "sub": settings.apple_client_id}
    signing_input = f"{_b64url(json.dumps(header, separators=(',', ':')).encode())}.{_b64url(json.dumps(claims, separators=(',', ':')).encode())}"
    pem = settings.apple_private_key.get_secret_value() if settings.apple_private_key else ""
    key = serialization.load_pem_private_key(pem.replace("\\n", "\n").encode(), password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise SignInError("apple")
    r, s = decode_dss_signature(key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256())))
    return f"{signing_input}.{_b64url(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"


def apple_claims(id_token: str, settings: Settings, user: dict[str, Any] | None) -> Identity:
    """Who Apple says signed in. The token came straight from Apple over TLS; its issuer, audience and age still count."""
    try:
        payload = id_token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        raise SignInError("apple") from None
    if claims.get("iss") != APPLE_ISSUER or claims.get("aud") != settings.apple_client_id \
            or int(claims.get("exp", 0)) < time.time() or not claims.get("sub"):
        raise SignInError("apple")
    # Apple shares the name only the first time, in the form it posts back.
    name_parts = ((user or {}).get("name") or {})
    name = " ".join(p for p in (name_parts.get("firstName"), name_parts.get("lastName")) if p).strip() or None
    return Identity(provider="apple", subject=str(claims["sub"]), email=claims.get("email"),
                    email_verified=str(claims.get("email_verified")).lower() == "true", name=name)


async def apple_identity(code: str, user_form: str | None) -> Identity:
    settings = get_settings()
    async with _http() as http:
        try:
            token = await http.post(APPLE_TOKEN, data={
                "client_id": settings.apple_client_id, "client_secret": apple_client_secret(settings), "code": code,
                "grant_type": "authorization_code", "redirect_uri": redirect_uri("apple", settings)})
        except httpx.HTTPError as exc:
            raise SignInError("apple") from exc
    if token.status_code != 200 or not token.json().get("id_token"):
        raise SignInError("apple")
    try:
        user = json.loads(user_form) if user_form else None
    except ValueError:
        user = None
    return apple_claims(token.json()["id_token"], settings, user if isinstance(user, dict) else None)


async def sign_in(db: AsyncSession, identity: Identity) -> User:
    """The Faldo account this Google or Apple account signs into, joining or making one on its first sign-in."""
    link = (await db.execute(select(OAuthIdentity).where(OAuthIdentity.provider == identity.provider,
                                                         OAuthIdentity.subject == identity.subject))).scalar_one_or_none()
    if link:
        user = await db.get(User, link.user_id)
        if user is None:
            raise SignInError(identity.provider)
        await set_user_scope(db, user.id)
        return user
    if not identity.email or not identity.email_verified:
        raise SignInError("unverified")
    user = (await db.execute(select(User).where(User.email == identity.email))).scalar_one_or_none()
    if user is None:
        name = (identity.name or identity.email.split("@")[0]).strip()[:80] or "Friend"
        user = User(id=uuid.uuid4(), email=identity.email, password_hash=None, display_name=name)
        db.add(user)
        await db.flush()
        await set_user_scope(db, user.id)
        db.add(UserSettings(user_id=user.id))
        await create_default_categories(db, user.id)
    else:
        await set_user_scope(db, user.id)
    db.add(OAuthIdentity(user_id=user.id, provider=identity.provider, subject=identity.subject, email=identity.email))
    await db.flush()
    return user
