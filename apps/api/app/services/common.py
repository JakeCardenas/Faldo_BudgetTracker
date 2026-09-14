import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound


async def get_owned[T](db: AsyncSession, model: type[T], entity_id: uuid.UUID, user_id: uuid.UUID, label: str) -> T:
    row = (
        await db.execute(select(model).where(model.id == entity_id, model.user_id == user_id))  # type: ignore[attr-defined]
    ).scalar_one_or_none()
    if row is None:
        raise NotFound(f"{label} not found.")
    return row


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s&'-]", " ", name.lower())).strip()


def apply_updates(entity: Any, updates: dict[str, Any]) -> None:
    for key, value in updates.items():
        setattr(entity, key, value)
