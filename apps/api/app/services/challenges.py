"""Money challenges Faldo tracks with the user.

- ipon_daily: save the same amount every day for a set number of days.
- ipon_52: the 52-week ipon challenge; week n saves n times the base amount (₱20 base ends at ₱27,560).
- no_spend: go a number of days without spending in one category, or on anything non-essential.
- spend_cap: keep a category's spending under a cap for a number of days.

Ipon challenges save into their own savings goal, so money is added the usual way (Goals, Add money). Progress is
always worked out from the user's real records, never self-reported.
"""

import math
import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFound
from app.engine.money import format_money
from app.models import Category, Challenge, GoalContribution, Transaction
from app.models.enums import TransactionType
from app.models.identity import UserSettings
from app.schemas.planning import ChallengeIn, GoalIn
from app.services import goals

KIND_TITLES = {
    "ipon_daily": "Daily ipon challenge",
    "ipon_52": "52-week ipon challenge",
    "no_spend": "No-spend challenge",
    "spend_cap": "Spending cap challenge",
}
WEEKS_52_TOTAL = 52 * 53 // 2  # 1 + 2 + … + 52 base amounts


def _days(challenge: Challenge) -> int:
    return (challenge.end_on - challenge.start_on).days + 1


async def create_challenge(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date, data: ChallengeIn) -> Challenge:
    kind = data.kind
    days = 364 if kind == "ipon_52" else data.days
    if kind in {"ipon_daily", "ipon_52", "spend_cap"} and not data.amount_minor:
        raise AppError("Give an amount for this challenge.")
    category = None
    if data.category_id:
        category = await db.get(Category, data.category_id)
        if category is None or category.user_id != user_id:
            raise NotFound("Category not found.")
    if kind == "spend_cap" and category is None:
        raise AppError("Pick the category to cap.")
    title = (data.title or "").strip() or KIND_TITLES[kind] + (f": {category.name}" if category else "")
    challenge = Challenge(user_id=user_id, kind=kind, title=title[:80], amount_minor=data.amount_minor,
                          category_id=category.id if category else None, start_on=today, end_on=today + timedelta(days=days - 1))
    if kind in {"ipon_daily", "ipon_52"}:
        assert data.amount_minor is not None
        total = data.amount_minor * (WEEKS_52_TOTAL if kind == "ipon_52" else days)
        goal = await goals.create_goal(db, user_id, settings.currency, GoalIn(
            name=title[:80], target_minor=total, target_date=challenge.end_on,
            monthly_contribution_minor=round(total / max(days / 30.4375, 1)),
            notes="Saved through a Faldo challenge. Add money here as you save."), today)
        challenge.goal_id = goal.id
    db.add(challenge)
    await db.flush()
    return challenge


async def _saved(db: AsyncSession, challenge: Challenge) -> int:
    if challenge.goal_id is None:
        return 0
    total = await db.scalar(select(func.coalesce(func.sum(GoalContribution.amount_minor), 0))
                            .where(GoalContribution.goal_id == challenge.goal_id))
    return int(total or 0)


def _spending(user_id: uuid.UUID, challenge: Challenge, until: date) -> Any:
    stmt = select(Transaction).where(
        Transaction.user_id == user_id, Transaction.type == TransactionType.expense,
        Transaction.occurred_on >= challenge.start_on, Transaction.occurred_on <= until)
    if challenge.category_id:
        return stmt.where(or_(Transaction.category_id == challenge.category_id, Transaction.subcategory_id == challenge.category_id))
    # Without a category, "no spend" means nothing non-essential.
    essential = select(Category.id).where(Category.user_id == user_id, Category.is_essential.is_(True))
    return stmt.where(or_(Transaction.category_id.is_(None), Transaction.category_id.not_in(essential)))


async def progress(db: AsyncSession, user_id: uuid.UUID, challenge: Challenge, today: date, currency: str) -> dict[str, Any]:
    fmt = lambda minor: format_money(minor, currency)  # noqa: E731
    total_days = _days(challenge)
    elapsed = max(0, min(total_days, (today - challenge.start_on).days + 1))
    ended = today > challenge.end_on or challenge.status == "ended"
    out: dict[str, Any] = {
        "id": str(challenge.id), "kind": challenge.kind, "title": challenge.title, "status": challenge.status,
        "start_on": challenge.start_on.isoformat(), "end_on": challenge.end_on.isoformat(),
        "days_total": total_days, "days_elapsed": elapsed, "days_left": max(0, total_days - elapsed),
        "goal_id": str(challenge.goal_id) if challenge.goal_id else None,
        "category_id": str(challenge.category_id) if challenge.category_id else None,
    }
    amount = challenge.amount_minor or 0
    if challenge.kind in {"ipon_daily", "ipon_52"}:
        saved = await _saved(db, challenge)
        # Today's (or this week's) amount only counts as due once the day (or week) is over.
        if challenge.kind == "ipon_daily":
            target, due, due_now = amount * total_days, amount * max(elapsed - 1, 0), amount * elapsed
            next_step = "You're done for today" if saved >= due_now else f"Save {fmt(amount)} today"
        else:
            week = min(52, max(1, math.ceil(elapsed / 7)))
            target, due, due_now = amount * WEEKS_52_TOTAL, amount * (week - 1) * week // 2, amount * week * (week + 1) // 2
            next_step = f"Week {week} done" if saved >= due_now else f"Week {week}: save {fmt(amount * week)}"
            out["week"] = week
            out["this_week_minor"] = amount * week
        done = saved >= target
        out.update(saved_minor=saved, target_minor=target, due_so_far_minor=due, behind_minor=max(0, due - saved),
                   pct=min(100.0, round(saved / target * 100, 1)) if target else 0.0, on_track=saved >= due,
                   summary=f"{fmt(saved)} of {fmt(target)} saved" + ("" if saved >= due else f", {fmt(due - saved)} behind"),
                   next_step=None if done or ended else next_step)
        out["state"] = "completed" if done else ("missed" if ended else "active")
    elif challenge.kind == "no_spend":
        until = min(today, challenge.end_on)
        spent_on = _spending(user_id, challenge, until).subquery()
        days_spent = await db.scalar(select(func.count(func.distinct(spent_on.c.occurred_on)))) if elapsed else 0
        days_spent = int(days_spent or 0)
        clean = max(0, elapsed - days_spent)
        out.update(days_spent=days_spent, clean_days=clean, pct=round(clean / total_days * 100, 1), on_track=days_spent == 0,
                   summary=f"{clean} of {total_days} days without spending" + (f" ({days_spent} slipped)" if days_spent else ""),
                   next_step=None if ended else "Skip it today")
        out["state"] = ("completed" if days_spent == 0 else "missed") if ended else "active"
    else:
        until = min(today, challenge.end_on)
        sub = _spending(user_id, challenge, until).subquery()
        spent = int(await db.scalar(select(func.coalesce(func.sum(sub.c.amount_minor), 0))) or 0)
        out.update(spent_minor=spent, cap_minor=amount, left_minor=amount - spent,
                   pct=round(spent / amount * 100, 1) if amount else 0.0,
                   on_track=spent <= amount * max(elapsed, 1) / total_days,
                   summary=f"{fmt(spent)} of {fmt(amount)} spent" + (f", {fmt(amount - spent)} left" if spent <= amount else ", over the cap"),
                   next_step=None if ended else f"{fmt(max(0, amount - spent))} left for {max(0, total_days - elapsed)} days")
        out["state"] = ("completed" if spent <= amount else "missed") if ended else ("missed" if spent > amount else "active")
    return out


async def list_challenges(db: AsyncSession, user_id: uuid.UUID, today: date, currency: str) -> list[dict[str, Any]]:
    rows = (await db.execute(select(Challenge).where(Challenge.user_id == user_id, Challenge.end_on >= today - timedelta(days=30))
                             .order_by(Challenge.created_at.desc()).limit(20))).scalars().all()
    items = [await progress(db, user_id, c, today, currency) for c in rows]
    return sorted(items, key=lambda i: (i["state"] != "active", i["end_on"]))


async def end_challenge(db: AsyncSession, user_id: uuid.UUID, challenge_id: uuid.UUID) -> None:
    challenge = await db.get(Challenge, challenge_id)
    if challenge is None or challenge.user_id != user_id:
        raise NotFound("Challenge not found.")
    challenge.status = "ended"


async def challenge_signals(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> list[Any]:
    from app.services.companion import Signal

    out: list[Signal] = []
    for c in await list_challenges(db, user_id, today, settings.currency):
        if c["status"] == "ended":
            continue
        if c["state"] == "completed" and c["end_on"] >= (today - timedelta(days=7)).isoformat():
            out.append(Signal(f"challenge_done:{c['id']}", "challenge", 2, f"You finished the {c['title']}!",
                              f"{c['summary']}. That's a real win.", f"I finished my {c['title']}. What should I try next?",
                              "celebrate", "/streaks"))
        elif c["state"] == "active" and not c["on_track"]:
            out.append(Signal(f"challenge_behind:{c['id']}:{today.isoformat()}", "challenge", 3, f"{c['title']}: let's catch up",
                              f"{c['summary']}. A small step today gets you back on track.",
                              f"How do I catch up on my {c['title']}?", "motivated", "/streaks"))
        elif c["state"] == "active" and c.get("next_step"):
            out.append(Signal(f"challenge_step:{c['id']}:{today.isoformat()}", "challenge", 5,
                              f"Day {c['days_elapsed']} of your {c['title']}", f"{c['summary']}. {c['next_step']}.",
                              f"How is my {c['title']} going?", "motivated", "/streaks"))
    return out
