import hashlib
import secrets
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

_hasher = PasswordHasher()
_DUMMY_HASH = _hasher.hash("faldo-timing-equalizer")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def session_window(remember: bool) -> timedelta:
    """How long a session lives without use: the configured days when remembered, half a day when it's only meant to
    last until the browser closes (the cookie goes then anyway; this ends it on the server too)."""
    return timedelta(days=get_settings().session_ttl_days) if remember else timedelta(hours=12)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
