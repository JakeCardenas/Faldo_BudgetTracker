import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models import AIMessage, Budget, Receipt, RecurringPayment, SavingsGoal, Transaction, UserSettings

RESTORES_PER_MONTH = 2


@dataclass(frozen=True)
class BadgeDef:
    id: str
    name: str
    description: str
    group: str
    threshold: int = 1


STREAK_BADGES = [
    BadgeDef("first_sprout", "First Sprout", "Log your money for the first time.", "streak", 1),
    BadgeDef("two_in_a_row", "Two in a Row", "Log two days in a row.", "streak", 2),
    BadgeDef("warming_up", "Warming Up", "Keep a 3-day streak.", "streak", 3),
    BadgeDef("full_week", "Full Week", "Keep a 7-day streak.", "streak", 7),
    BadgeDef("fortnight_focus", "Fortnight Focus", "Keep a 14-day streak.", "streak", 14),
    BadgeDef("monthly_habit", "Monthly Habit", "Keep a 30-day streak.", "streak", 30),
    BadgeDef("sixty_strong", "Sixty Strong", "Keep a 60-day streak.", "streak", 60),
    BadgeDef("hundred_club", "Hundred Club", "Keep a 100-day streak.", "streak", 100),
]

MILESTONE_BADGES = [
    BadgeDef("budget_builder", "Budget Builder", "Set up a monthly budget.", "milestone"),
    BadgeDef("goal_setter", "Goal Setter", "Create a savings goal.", "milestone"),
    BadgeDef("bill_planner", "Bill Planner", "Track a recurring bill or income.", "milestone"),
    BadgeDef("receipt_ranger", "Receipt Ranger", "Scan your first receipt.", "milestone"),
    BadgeDef("curious_mind", "Curious Mind", "Ask Faldo a question.", "milestone"),
    BadgeDef("scholar", "Scholar", "Finish 3 money lessons.", "milestone", 3),
]

OUTFITS: dict[str, str | None] = {
    "classic": None,
    "bucket_hat": "warming_up",
    "scarf": "full_week",
    "headphones": "curious_mind",
    "flower_crown": "goal_setter",
    "grad_cap": "scholar",
    "shades": "fortnight_focus",
    "crown": "monthly_habit",
}

# Home environments: Faldo's panda habitat, then landmarks across Asia, each unlocked by a badge. The ids are the
# original theme ids (kept so saved choices still work); the web app draws them (components/brand/scenery.tsx):
# sunrise is Mayon Volcano, terraces the Banaue Rice Terraces, lagoon Marina Bay, hills Mount Fuji, bay_sunset Wat Arun,
# seoul Gyeongbokgung and night_market Taipei 101.
BACKGROUNDS: dict[str, str | None] = {
    "meadow": None,
    "sunrise": "two_in_a_row",
    "terraces": "full_week",
    "lagoon": "budget_builder",
    "hills": "fortnight_focus",
    "bay_sunset": "bill_planner",
    "seoul": "goal_setter",
    "night_market": "monthly_habit",
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

    milestones = {
        "budget_builder": await _count(db, Budget, user_id),
        "goal_setter": await _count(db, SavingsGoal, user_id),
        "bill_planner": await _count(db, RecurringPayment, user_id),
        "receipt_ranger": await _count(db, Receipt, user_id),
        "curious_mind": await _count(db, AIMessage, user_id, AIMessage.role == "user"),
        "scholar": len(settings.completed_lessons or []),
    }

    badges = []
    for badge in STREAK_BADGES:
        badges.append({**badge.__dict__, "earned": best >= badge.threshold, "progress": min(streak, badge.threshold)})
    for badge in MILESTONE_BADGES:
        value = milestones[badge.id]
        badges.append({**badge.__dict__, "earned": value >= badge.threshold, "progress": min(value, badge.threshold)})
    earned = {b["id"] for b in badges if b["earned"]}
    next_badge = next((b for b in badges if b["group"] == "streak" and b["threshold"] > streak), None)

    return {
        "current_streak": streak,
        "best_streak": best,
        "logged_today": today in logged,
        "restores_left": restores_left,
        "restores_per_month": RESTORES_PER_MONTH,
        "logged_days_total": len(logged),
        "week": [{"date": (today - timedelta(days=i)).isoformat(), "logged": today - timedelta(days=i) in logged}
                 for i in range(6, -1, -1)],
        "badges": badges,
        "earned_count": len(earned),
        "next_badge": next_badge,
        "outfits": [{"id": k, "required_badge": v, "unlocked": v is None or v in earned} for k, v in OUTFITS.items()],
        "backgrounds": [{"id": k, "required_badge": v, "unlocked": v is None or v in earned}
                        for k, v in BACKGROUNDS.items()],
    }


async def check_reward(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date,
                       kind: str, value: str) -> None:
    catalog = OUTFITS if kind == "outfits" else BACKGROUNDS
    if value not in catalog:
        raise AppError("That reward doesn't exist.")
    required = catalog[value]
    if required is None:
        return
    data = await engagement(db, user_id, settings, today)
    if not any(b["id"] == required and b["earned"] for b in data["badges"]):
        raise AppError("Keep your streak going to unlock that reward.")
