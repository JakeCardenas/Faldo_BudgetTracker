import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models import AIMessage, SavingsGoal, Transaction, UserSettings

RESTORES_PER_MONTH = 2


@dataclass(frozen=True)
class Unlock:
    """What unlocks a Faldo pose: a streak of `target` days (the best one counts), or `target` of something done."""

    kind: str
    target: int = 1


# Faldo's poses (the ids began as outfits; the web app maps each to a canonical panda artwork). Classic is always his.
OUTFITS: dict[str, Unlock | None] = {
    "classic": None,
    "bucket_hat": Unlock("streak", 3),
    "scarf": Unlock("streak", 7),
    "headphones": Unlock("questions"),
    "flower_crown": Unlock("goals"),
    "grad_cap": Unlock("lessons", 3),
    "shades": Unlock("streak", 14),
    "crown": Unlock("streak", 30),
}


def current_streak(logged: set[date], today: date) -> tuple[int, int]:
    cursor = today if today in logged else today - timedelta(days=1)
    restores_left = RESTORES_PER_MONTH
    streak = 0
    while True:
        if cursor in logged:
            streak += 1
        elif (streak > 0 or cursor == today - timedelta(days=1)) and restores_left > 0 \
                and (cursor.year, cursor.month) == (today.year, today.month) \
                and cursor - timedelta(days=1) in logged:
            restores_left -= 1
            streak += 1
        else:
            break
        cursor -= timedelta(days=1)
    return streak, restores_left


def best_streak(logged: set[date]) -> int:
    best = run = 0
    previous: date | None = None
    for day in sorted(logged):
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        best = max(best, run)
        previous = day
    return best


async def _count(db: AsyncSession, model: Any, user_id: uuid.UUID, *where: Any) -> int:
    stmt = select(func.count()).select_from(model).where(model.user_id == user_id, *where)
    return int(await db.scalar(stmt) or 0)


async def engagement(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> dict:
    rows = await db.execute(select(Transaction.occurred_on).where(Transaction.user_id == user_id,
                                                                  Transaction.occurred_on <= today).distinct())
    logged = {r[0] for r in rows}
    streak, restores_left = current_streak(logged, today)
    best = max(best_streak(logged), streak)

    done = {
        "questions": await _count(db, AIMessage, user_id, AIMessage.role == "user"),
        "goals": await _count(db, SavingsGoal, user_id),
        "lessons": len(settings.completed_lessons or []),
    }
    outfits = []
    for outfit, unlock in OUTFITS.items():
        if unlock is None:
            outfits.append({"id": outfit, "unlocked": True, "progress": 0, "target": 0})
            continue
        reached = best if unlock.kind == "streak" else done[unlock.kind]
        # A streak shows the current run toward the target; once the best run reached it, the pose stays unlocked.
        progress = streak if unlock.kind == "streak" else reached
        outfits.append({"id": outfit, "unlocked": reached >= unlock.target,
                        "progress": min(progress, unlock.target), "target": unlock.target})

    return {
        "current_streak": streak,
        "best_streak": best,
        "logged_today": today in logged,
        "restores_left": restores_left,
        "restores_per_month": RESTORES_PER_MONTH,
        "logged_days_total": len(logged),
        "week": [{"date": (today - timedelta(days=i)).isoformat(), "logged": today - timedelta(days=i) in logged}
                 for i in range(6, -1, -1)],
        "outfits": outfits,
    }


async def check_outfit(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, outfit: str) -> None:
    if outfit not in OUTFITS:
        raise AppError("That pose doesn't exist.")
    if OUTFITS[outfit] is None:
        return
    data = await engagement(db, user_id, settings, today)
    if not any(o["id"] == outfit and o["unlocked"] for o in data["outfits"]):
        raise AppError("Keep going to unlock that pose.")
