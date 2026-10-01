"""Demo sandboxes: try Faldo without signing up, in an account of your own.

Each visitor who starts the demo gets a new user with the sample data from app/seed/demo.py and an end time
(demo_expires_at). Nobody else can see or change it, there's no password or real email to share, and it has a much
smaller daily AI allowance (ai/usage.py). After demo_hours it stops working (api/deps.py), and it's deleted when its
visitor signs out, when the next demo starts, or by the daily job, whichever comes first. Things that store files or
send email are turned off in a demo (refuse_in_demo).
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import set_user_scope
from app.core.errors import AppError, ServiceUnavailable
from app.models import User
from app.seed.demo import populate

DEMO_NAME = "Bea"
# A reserved domain (RFC 2606): mail to it can never be delivered, and no real person can sign in as it.
DEMO_EMAIL_DOMAIN = "demo.faldo.invalid"


def is_demo(user: User) -> bool:
    return user.demo_expires_at is not None


def refuse_in_demo(user: User, what: str) -> None:
    """Stop something a demo shouldn't do, saying what and how to get it."""
    if is_demo(user):
        raise AppError(f"{what} isn't available in the demo. Create an account to use it.", status_code=403)


async def active_count(db: AsyncSession) -> int:
    now = datetime.now(UTC)
    return int(await db.scalar(select(func.count()).select_from(User).where(User.demo_expires_at > now)) or 0)


async def purge_expired(db: AsyncSession, limit: int = 50) -> int:
    """Delete demo sandboxes past their end time, everything in them included (every table cascades from users)."""
    now = datetime.now(UTC)
    ids = list((await db.execute(select(User.id).where(User.demo_expires_at <= now)
                                 .order_by(User.demo_expires_at).limit(limit))).scalars())
    if ids:
        await db.execute(delete(User).where(User.id.in_(ids), User.demo_expires_at.is_not(None)))
    return len(ids)


async def create(db: AsyncSession) -> User:
    """A new sandbox with its sample data, in this (unscoped) session, which is left scoped to the new user."""
    settings = get_settings()
    await purge_expired(db, limit=10)  # a few at a time here; the daily job (api/v1/internal.py) clears the rest
    if await active_count(db) >= settings.demo_max_active:
        raise ServiceUnavailable("A lot of people are trying the demo right now. "
                                 "Try again in a little while, or create an account.")
    user = User(email=f"demo-{uuid.uuid4().hex}@{DEMO_EMAIL_DOMAIN}", password_hash=None, display_name=DEMO_NAME,
                demo_expires_at=datetime.now(UTC) + timedelta(hours=settings.demo_hours))
    db.add(user)
    await db.flush()
    await set_user_scope(db, user.id)
    await populate(db, user.id)
    return user


async def end(db: AsyncSession, user: User) -> None:
    """Delete a demo sandbox now (its visitor signed out). Does nothing to a real account."""
    if is_demo(user):
        await db.execute(delete(User).where(User.id == user.id, User.demo_expires_at.is_not(None)))
