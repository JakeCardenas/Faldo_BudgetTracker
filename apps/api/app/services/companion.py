"""What Faldo would bring up first, like a friend who keeps an eye on your money.

One list of signals, most urgent first, drawn from the user's own data (a budget running low, a bill due, payday, a
goal behind or reached, last week's spending, an active challenge) and from the calendar (13th month, Christmas, back
to school, Undas, Valentine's, Mother's and Father's Day, the new year, and birthdays the user told Faldo about).
The same signals become Faldo's check-ins in chat, the personal chat starters, and the daily phone notification.
"""

import calendar
import re
import uuid
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.money import format_money
from app.models.identity import UserSettings
from app.models.planning import FinancialNote
from app.services.analytics import totals_by_type
from app.services.budgets import budget_status
from app.services.forecast import safe_to_spend
from app.services.goals import list_goals
from app.services.recurring import upcoming


@dataclass
class Signal:
    key: str
    """Stable id for this moment, so the same check-in isn't sent twice."""
    kind: str
    priority: int
    """Lower is more urgent."""
    title: str
    body: str
    """What Faldo says, in one or two sentences."""
    prompt: str
    """The question to ask Faldo about it."""
    mood: str
    """Faldo's pose (see FALDO_MOODS in the web app)."""
    href: str | None = None

    def out(self) -> dict[str, Any]:
        return asdict(self)


MONTHS = {
    "january": 1, "jan": 1, "enero": 1, "february": 2, "feb": 2, "pebrero": 2, "march": 3, "mar": 3, "marso": 3,
    "april": 4, "apr": 4, "abril": 4, "may": 5, "mayo": 5, "june": 6, "jun": 6, "hunyo": 6, "july": 7, "jul": 7,
    "hulyo": 7, "august": 8, "aug": 8, "agosto": 8, "september": 9, "sept": 9, "sep": 9, "setyembre": 9,
    "october": 10, "oct": 10, "oktubre": 10, "november": 11, "nov": 11, "nobyembre": 11, "december": 12, "dec": 12,
    "disyembre": 12,
}
_MONTH = "|".join(sorted(MONTHS, key=len, reverse=True))
BIRTHDAY_RE = re.compile(r"\b(birthday|bday|b-day|kaarawan|kaarawan ni|debut)\b", re.IGNORECASE)
DATE_RE = re.compile(rf"\b(?:({_MONTH})\.?\s*(\d{{1,2}})?(?:st|nd|rd|th)?|(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({_MONTH}))\b",
                     re.IGNORECASE)


def _nth_sunday(year: int, month: int, n: int) -> date:
    first = date(year, month, 1)
    return first + timedelta(days=(6 - first.weekday()) % 7 + 7 * (n - 1))


def _next(today: date, month: int, day: int) -> date:
    """The next time this calendar day comes around, today included."""
    day = min(day, calendar.monthrange(today.year, month)[1])
    this_year = date(today.year, month, day)
    if this_year >= today:
        return this_year
    return date(today.year + 1, month, min(day, calendar.monthrange(today.year + 1, month)[1]))


def seasonal(today: date) -> list[Signal]:
    """Philippine money moments coming up in the next few weeks."""
    out: list[Signal] = []

    def days_to(d: date) -> int:
        return (d - today).days

    christmas = _next(today, 12, 25)
    if 0 < days_to(christmas) <= 55:
        out.append(Signal(f"season:christmas:{christmas.year}", "season", 5, f"Christmas is {days_to(christmas)} days away",
                          "Gifts, Noche Buena and pamasko add up fast. Want to set a Christmas budget before the rush?",
                          "Help me set a Christmas budget for gifts, Noche Buena and pamasko.", "love"))
    if today.month in (11, 12) and today <= date(today.year, 12, 24) and (today.month == 12 or today.day >= 10):
        out.append(Signal(f"season:13th:{today.year}", "season", 4, "13th month pay is coming",
                          "It must be paid by December 24. A plan before it lands keeps it from disappearing in the holidays.",
                          "Help me plan my 13th month pay before it arrives.", "money"))
    new_year = date(today.year + 1, 1, 1) if today.month == 12 else date(today.year, 1, 1)
    if -7 <= days_to(new_year) <= 5 and today.month in (12, 1):
        year = new_year.year
        out.append(Signal(f"season:newyear:{year}", "season", 6, f"Fresh start for {year}",
                          f"New year, new money goals. Want to set one or two savings goals for {year}?",
                          f"Help me set money goals for {year}.", "motivated", "/goals"))
    undas = _next(today, 11, 1)
    if 0 < days_to(undas) <= 14:
        out.append(Signal(f"season:undas:{undas.year}", "season", 6, "Undas is coming",
                          "Travel home, flowers, candles and food for the family add up. Plan it so it doesn't surprise you.",
                          "Help me budget for Undas travel and expenses.", "thinking"))
    valentines = _next(today, 2, 14)
    if 0 <= days_to(valentines) <= 14:
        out.append(Signal(f"season:valentines:{valentines.year}", "season", 6, "Valentine's Day is coming",
                          "Want a few thoughtful ideas that fit your budget?",
                          "Suggest Valentine's gift ideas that fit my budget.", "love"))
    for label, month, nth in (("Mother's Day", 5, 2), ("Father's Day", 6, 3)):
        day = _nth_sunday(today.year, month, nth)
        if day < today:
            day = _nth_sunday(today.year + 1, month, nth)
        if 0 <= days_to(day) <= 14:
            out.append(Signal(f"season:{label.lower().replace(' ', '')}:{day.year}", "season", 6,
                              f"{label} is {'today' if day == today else f'on {day:%B %-d}'}",
                              "Want a few gift ideas that fit your budget?", f"Suggest {label} gift ideas that fit my budget.", "love"))
    school = date(today.year, 6, 16)
    if 0 <= days_to(school) <= 30:
        out.append(Signal(f"season:school:{today.year}", "season", 5, "Back to school is coming",
                          "Tuition, uniforms, supplies and baon add up. Plan them now so June doesn't hurt.",
                          "Help me budget for back to school.", "idea"))
    return out


async def birthdays(db: AsyncSession, user_id: uuid.UUID, today: date) -> list[Signal]:
    """Birthdays the user told Faldo about ("tito's birthday is December 12"), three weeks ahead."""
    notes = (await db.execute(select(FinancialNote).where(FinancialNote.user_id == user_id)
                              .order_by(FinancialNote.created_at.desc()).limit(200))).scalars().all()
    out: list[Signal] = []
    for note in notes:
        if not BIRTHDAY_RE.search(note.content):
            continue
        match = DATE_RE.search(note.content)
        if not match:
            continue
        name = (match.group(1) or match.group(4) or "").lower()
        if name == "may" and not (match.group(2) or match.group(3)):
            continue
        day = int(match.group(2) or match.group(3) or 1)
        if not 1 <= day <= 31:
            continue
        when = _next(today, MONTHS[name], day)
        left = (when - today).days
        if left <= 21:
            quote = note.content.strip()[:120]
            out.append(Signal(f"birthday:{note.id}:{when.year}", "birthday", 3,
                              "A birthday is today" if left == 0 else f"A birthday is in {left} day{'s' if left != 1 else ''}",
                              f"You told me: “{quote}”. Want gift ideas that fit your budget?",
                              f"Suggest birthday gift ideas that fit my budget for this: {quote}", "love"))
    return out


async def signals(db: AsyncSession, user_id: uuid.UUID, settings: UserSettings, today: date) -> list[Signal]:
    fmt = lambda minor: format_money(minor, settings.currency)  # noqa: E731
    out: list[Signal] = []

    sts = await safe_to_spend(db, user_id, settings, today)
    if sts["status"] == "short" and sts["shortfall_minor"]:
        out.append(Signal(f"short:{today.isoformat()}", "short", 0, f"{fmt(sts['shortfall_minor'])} short before your next income",
                          "Bills, savings and your buffer need more than you have right now. Let's find a way through.",
                          "Why am I short this month, and what can I do?", "warning", "/forecast"))

    bills = [b for b in await upcoming(db, user_id, today, today + timedelta(days=2)) if not b["is_income"]]
    if len(bills) == 1:
        bill = bills[0]
        when = "overdue" if bill["is_overdue"] else ("due today" if bill["days_until_due"] == 0 else "due tomorrow"
                                                  if bill["days_until_due"] == 1 else f"due in {bill['days_until_due']} days")
        out.append(Signal(f"bill:{bill['recurring_payment_id']}:{bill['due_on']}", "bill", 1 if bill["is_overdue"] else 2,
                          f"{bill['name']} {fmt(bill['amount_minor'])} is {when}",
                          "Want to check you can cover it, or mark it paid if it's done?",
                          "Can I cover my bills this week?", "receipt", "/bills"))
    elif bills:
        overdue = [b for b in bills if b["is_overdue"]]
        shown = [b["name"] for b in bills[:3]]
        names = (", ".join(shown[:-1]) + " and " + shown[-1]) if len(bills) <= 3 else ", ".join(shown) + " and more"
        out.append(Signal("bills:" + ",".join(sorted(f"{b['recurring_payment_id']}:{b['due_on']}" for b in bills))[:150], "bill",
                          1 if overdue else 2, f"{len(bills)} bills need you" + (f", {len(overdue)} overdue" if overdue else ""),
                          f"{names}: {fmt(sum(b['amount_minor'] for b in bills))} in all. Want to check you can cover them?",
                          "Can I cover my bills this week?", "receipt", "/bills"))

    if sts["next_income_on"]:
        payday = date.fromisoformat(sts["next_income_on"]) if isinstance(sts["next_income_on"], str) else sts["next_income_on"]
        if 0 <= (payday - today).days <= 2:
            when = "today" if payday == today else "tomorrow" if (payday - today).days == 1 else "in 2 days"
            out.append(Signal(f"payday:{payday.isoformat()}", "payday", 3, f"Payday {when}",
                              "Give every peso a job before it arrives: bills first, then savings, then fun.",
                              "Help me plan my payday: bills, savings and spending.", "money"))

    status = await budget_status(db, user_id, today, today)
    month = today.strftime("%Y-%m")
    for line in sorted(status.lines, key=lambda line: -line.pct_used)[:2]:
        if line.status == "over":
            out.append(Signal(f"budget_over:{line.category_id}:{month}", "budget", 1, f"{line.category_name} is over budget",
                              f"You've spent {fmt(line.spent_minor)} of {fmt(line.limit_minor)}. Let's plan the rest of the month.",
                              f"My {line.category_name} budget is over. What should I do for the rest of the month?", "surprised", "/budgets"))
        elif line.status in {"at_risk", "near_limit", "at_limit"}:
            out.append(Signal(f"budget_low:{line.category_id}:{month}", "budget", 2,
                              f"{line.category_name} is at {round(line.pct_used)}%",
                              f"{fmt(line.remaining_minor)} left for the month. A few small swaps can keep you under.",
                              f"How can I stay under my {line.category_name} budget?", "warning", "/budgets"))

    for goal in [g for g in await list_goals(db, user_id, today) if g.status.value == "active"]:
        if goal.pct_complete >= 100:
            out.append(Signal(f"goal_reached:{goal.id}", "goal", 2, f"You reached {goal.name}!",
                              f"{fmt(goal.saved_minor)} saved. That took real discipline. What's next?",
                              f"I reached my {goal.name} goal. What should I do next?", "celebrate", "/goals"))
        elif goal.on_track is False:
            out.append(Signal(f"goal_behind:{goal.id}:{month}", "goal", 4, f"{goal.name} is behind schedule",
                              "A small bump to your monthly saving can get it back on track.",
                              f"How can I catch up on my {goal.name} goal?", "motivated", "/goals"))

    week_start = today - timedelta(days=today.weekday() + 7)
    last_week = await totals_by_type(db, user_id, week_start, week_start + timedelta(days=6))
    week_before = await totals_by_type(db, user_id, week_start - timedelta(days=7), week_start - timedelta(days=1))
    if last_week["expense"]:
        change = ""
        if week_before["expense"]:
            delta = round((last_week["expense"] - week_before["expense"]) / week_before["expense"] * 100)
            if abs(delta) >= 5:
                change = f", {abs(delta)}% {'more' if delta > 0 else 'less'} than the week before"
        out.append(Signal(f"recap:{week_start.isoformat()}", "recap", 7, "Your week in money",
                          f"Last week you spent {fmt(last_week['expense'])}{change}.",
                          "Give me my weekly money recap.", "chart"))

    from app.services.challenges import challenge_signals

    out += await challenge_signals(db, user_id, settings, today)
    out += await birthdays(db, user_id, today)
    out += seasonal(today)
    return sorted(out, key=lambda s: s.priority)


STARTER_DEFAULTS = [
    {"prompt": "Where did my money go this month?", "label": "Where did my money go?", "mood": "chart"},
    {"prompt": "How much can I safely spend this week?", "label": "What's safe to spend?", "mood": "wallet"},
    {"prompt": "Suggest gift ideas for someone special, budget ₱2,000.", "label": "Gift ideas", "mood": "love"},
    {"prompt": "Start a savings challenge with me.", "label": "Start a challenge", "mood": "motivated"},
]


def starters(found: list[Signal], limit: int = 4) -> list[dict[str, str]]:
    """Chat starters from the user's own situation, topped up with good defaults."""
    out: list[dict[str, str]] = []
    seen_kinds: set[str] = set()
    for s in found:
        if s.kind in seen_kinds and s.kind != "season":
            continue
        seen_kinds.add(s.kind)
        out.append({"prompt": s.prompt, "label": s.title, "mood": s.mood})
        if len(out) == limit:
            return out
    for d in STARTER_DEFAULTS:
        if len(out) == limit:
            break
        if all(d["prompt"] != o["prompt"] for o in out):
            out.append(d)
    return out
