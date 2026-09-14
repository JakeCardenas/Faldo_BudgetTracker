import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None

_SSL_PARAMS = {"sslmode", "ssl", "channel_binding", "sslrootcert", "sslcert", "sslkey"}


def normalize_database_url(url: str) -> tuple[str, dict[str, Any]]:
    parts = urlsplit(url)
    scheme = parts.scheme
    if scheme in {"postgres", "postgresql"}:
        scheme = "postgresql+asyncpg"
    params = dict(parse_qsl(parts.query))
    connect_args: dict[str, Any] = {}
    sslmode = params.get("sslmode") or params.get("ssl")
    if sslmode and sslmode not in {"disable", "allow", "false"}:
        connect_args["ssl"] = "require" if sslmode in {"require", "prefer", "true"} else sslmode
    query = urlencode({k: v for k, v in params.items() if k not in _SSL_PARAMS})
    return urlunsplit((scheme, parts.netloc, parts.path, query, parts.fragment)), connect_args


def build_engine(url: str) -> AsyncEngine:
    settings = get_settings()
    normalized, connect_args = normalize_database_url(url)
    if settings.db_pgbouncer:
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_name_func"] = lambda: f"__faldo_{uuid.uuid4().hex}__"
    options: dict[str, Any] = {"pool_pre_ping": True, "connect_args": connect_args}
    if settings.db_pool == "null":
        options["poolclass"] = NullPool
    else:
        options["pool_size"] = 10
    return create_async_engine(normalized, **options)


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        _engine = build_engine(get_settings().database_url)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False, autoflush=False)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


async def set_user_scope(session: AsyncSession, user_id: uuid.UUID | None) -> None:
    await session.execute(
        text("SELECT set_config('app.user_id', :uid, true)"),
        {"uid": str(user_id) if user_id else ""},
    )


@asynccontextmanager
async def scoped_session(user_id: uuid.UUID | None) -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session, session.begin():
        await set_user_scope(session, user_id)
        yield session
