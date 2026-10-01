import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_sessionmaker, set_user_scope
from app.core.errors import DemoEnded, ReauthenticationRequired, Unauthorized
from app.core.security import hash_token, session_window
from app.engine.periods import today_in
from app.models import Session, User, UserSettings

logger = logging.getLogger("faldo.deps")


@dataclass
class Ctx:
    db: AsyncSession
    user: User
    settings: UserSettings
    session_token_hash: str
    reauthenticated_at: datetime | None = None

    @property
    def user_id(self) -> uuid.UUID:
        return self.user.id

    @property
    def currency(self) -> str:
        return self.settings.currency

    @property
    def today(self) -> date:
        return today_in(self.settings.timezone)


async def get_anon_db() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session, session.begin():
        await set_user_scope(session, None)
        yield session


async def get_ctx(request: Request) -> AsyncIterator[Ctx]:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise Unauthorized("Sign in to continue.")
    token_hash = hash_token(token)
    user_id: uuid.UUID | None = None
    async with get_sessionmaker()() as session, session.begin():
        now = datetime.now(UTC)
        row = (
            await session.execute(
                select(Session, User)
                .join(User, User.id == Session.user_id)
                .where(Session.token_hash == token_hash, Session.revoked_at.is_(None), Session.expires_at > now)
            )
        ).first()
        if row is None:
            raise Unauthorized("Your session has expired. Sign in again.")
        sess, user = row
        if user.demo_expires_at is not None and user.demo_expires_at <= now:
            raise DemoEnded("This demo has ended. Create an account to keep using Faldo.")
        await set_user_scope(session, user.id)
        user_settings = await session.get(UserSettings, user.id)
        if user_settings is None:
            raise Unauthorized("Account is not fully set up.")
        if now - sess.last_seen_at > timedelta(minutes=10):
            await session.execute(
                update(Session)
                .where(Session.token_hash == token_hash)
                .values(last_seen_at=now, expires_at=now + session_window(sess.remember))
            )
        user_id = user.id
        yield Ctx(db=session, user=user, settings=user_settings, session_token_hash=token_hash,
                  reauthenticated_at=sess.reauthenticated_at)
    if settings.job_mode == "inline" and request.method in {"POST", "PUT", "PATCH", "DELETE"} and user_id:
        from app.jobs.worker import drain

        try:
            await drain(settings.inline_job_limit, user_id)
        except Exception:
            logger.exception("Inline job processing failed")


# How recently this session must have proved who it is before deleting the account or downloading all its data.
REAUTH_WINDOW = timedelta(minutes=10)


async def require_recent_sign_in(ctx: Ctx) -> None:
    """Refuse a sensitive action unless this session signed in or re-entered its password within REAUTH_WINDOW, so a
    borrowed phone or a stolen session cookie alone can't export or delete everything."""
    if ctx.reauthenticated_at and datetime.now(UTC) - ctx.reauthenticated_at <= REAUTH_WINDOW:
        return
    if ctx.user.demo_expires_at is not None:
        return  # A demo sandbox has nothing to re-enter: its session is the only way in, and its data is sample data.
    from app.models import OAuthIdentity

    providers = sorted(set((await ctx.db.execute(select(OAuthIdentity.provider)
                                                 .where(OAuthIdentity.user_id == ctx.user_id))).scalars()))
    methods = (["password"] if ctx.user.password_hash else []) + providers
    raise ReauthenticationRequired("To keep your data safe, confirm it's you first.", extra={"methods": methods})


CtxDep = Annotated[Ctx, Depends(get_ctx, scope="function")]
AnonDbDep = Annotated[AsyncSession, Depends(get_anon_db, scope="function")]
# Sent by the client once per logical write and reused on every retry of it (see services/idempotency.py).
IdempotencyKeyHeader = Annotated[str | None, Header(
    alias="Idempotency-Key", min_length=8, max_length=255, pattern=r"^[!-~]+$",
    description="A unique value per logical write, reused unchanged on retries so the write happens once.",
)]
