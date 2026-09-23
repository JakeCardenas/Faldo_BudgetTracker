"""Faldo's daily check-in on the user's phone, as a web push notification.

The signing key (VAPID) is made on first use and kept in app_keys, so there's nothing to configure. Once a day the
cron run picks each subscribed user's most useful check-in (see companion.signals) and sends it if it's new; tapping it
opens Ask Faldo with that question. Subscriptions the push service reports as gone are removed.
"""

import asyncio
import base64
import json
import logging
import uuid
from typing import Any
from urllib.parse import quote

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_sessionmaker, scoped_session, set_user_scope
from app.engine.periods import today_in
from app.models import AppKey, PushSubscription, UserSettings

logger = logging.getLogger("faldo.push")
KEY_NAME = "vapid_private_pem"


async def _private_pem(db: AsyncSession) -> str:
    pem = await db.scalar(select(AppKey.value).where(AppKey.name == KEY_NAME))
    if pem:
        return pem
    fresh = ec.generate_private_key(ec.SECP256R1()).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    await db.execute(insert(AppKey).values(name=KEY_NAME, value=fresh).on_conflict_do_nothing(index_elements=["name"]))
    return str(await db.scalar(select(AppKey.value).where(AppKey.name == KEY_NAME)))


async def public_key(db: AsyncSession) -> str:
    """The key the browser needs to subscribe: the uncompressed P-256 point, base64url without padding."""
    key = serialization.load_pem_private_key((await _private_pem(db)).encode(), password=None)
    assert isinstance(key, ec.EllipticCurvePrivateKey)
    point = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(point).decode().rstrip("=")


async def subscribe(db: AsyncSession, user_id: uuid.UUID, endpoint: str, p256dh: str, auth: str) -> None:
    await db.execute(insert(PushSubscription).values(user_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth)
                     .on_conflict_do_update(index_elements=["endpoint"], set_={"user_id": user_id, "p256dh": p256dh, "auth": auth}))


async def unsubscribe(db: AsyncSession, user_id: uuid.UUID, endpoint: str | None = None) -> None:
    stmt = delete(PushSubscription).where(PushSubscription.user_id == user_id)
    if endpoint:
        stmt = stmt.where(PushSubscription.endpoint == endpoint)
    await db.execute(stmt)


def _send(sub: PushSubscription, payload: dict[str, Any], pem: str) -> int:
    """Send one notification; the push service's HTTP status (201 when accepted)."""
    from py_vapid import Vapid
    from pywebpush import WebPushException, webpush

    try:
        response = webpush({"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                           data=json.dumps(payload), vapid_private_key=Vapid.from_pem(pem.encode()),
                           vapid_claims={"sub": get_settings().public_app_url.rstrip("/") or "https://faldo.vercel.app"},
                           ttl=12 * 3600, timeout=10)
        return int(getattr(response, "status_code", 201))
    except WebPushException as exc:
        return int(getattr(exc.response, "status_code", 0) or 0)
    except Exception:
        logger.exception("Push send failed")
        return 0


async def send_to_user(user_id: uuid.UUID, payload: dict[str, Any]) -> int:
    """Send to all of a user's phones now; how many accepted it."""
    async with get_sessionmaker()() as session, session.begin():
        await set_user_scope(session, None)
        pem = await _private_pem(session)
        subs = list((await session.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))).scalars())
        sent = 0
        for sub in subs:
            status = await asyncio.to_thread(_send, sub, payload, pem)
            if status in {404, 410}:
                await session.delete(sub)
            elif 200 <= status < 300:
                sent += 1
        return sent


def checkin_payload(signal: Any) -> dict[str, Any]:
    return {"title": signal.title, "body": signal.body, "tag": signal.key[:60], "url": f"/assistant?q={quote(signal.prompt)}"}


async def send_daily_checkins() -> dict[str, int]:
    """The daily run: each subscribed user's most useful new check-in, at most one a day."""
    from app.services.companion import signals

    async with get_sessionmaker()() as session, session.begin():
        await set_user_scope(session, None)
        pem = await _private_pem(session)
        subs = list((await session.execute(select(PushSubscription))).scalars())
    stats = {"users": 0, "sent": 0, "skipped": 0, "removed": 0}
    by_user: dict[uuid.UUID, list[PushSubscription]] = {}
    for sub in subs:
        by_user.setdefault(sub.user_id, []).append(sub)
    for user_id, user_subs in by_user.items():
        stats["users"] += 1
        try:
            async with scoped_session(user_id) as db:
                settings = await db.get(UserSettings, user_id)
                if settings is None:
                    continue
                today = today_in(settings.timezone)
                found = await signals(db, user_id, settings, today)
        except Exception:
            logger.exception("Check-in failed for a user")
            continue
        sent_keys = {s.last_signal_key for s in user_subs}
        fresh = next((s for s in found if s.key not in sent_keys), None)
        if fresh is None or all(s.last_sent_on == today for s in user_subs):
            stats["skipped"] += 1
            continue
        payload = checkin_payload(fresh)
        async with get_sessionmaker()() as session, session.begin():
            await set_user_scope(session, None)
            for sub in user_subs:
                status = await asyncio.to_thread(_send, sub, payload, pem)
                row = await session.get(PushSubscription, sub.id)
                if row is None:
                    continue
                if status in {404, 410}:
                    await session.delete(row)
                    stats["removed"] += 1
                elif 200 <= status < 300:
                    row.last_signal_key, row.last_sent_on = fresh.key[:160], today
                    stats["sent"] += 1
    return stats
