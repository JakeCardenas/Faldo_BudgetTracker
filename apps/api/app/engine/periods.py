import calendar
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

PeriodName = Literal[
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "last_30_days",
    "last_90_days",
    "last_3_months",
    "last_6_months",
    "this_year",
    "last_year",
    "all_time",
    "custom",
]

PERIOD_NAMES: tuple[str, ...] = PeriodName.__args__  # type: ignore[attr-defined]


@dataclass(frozen=True)
class Period:
    name: str
    start: date
    end: date

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    def label(self) -> str:
        if self.start.day == 1 and self.end == month_end(self.start):
            return self.start.strftime("%B %Y")
        if self.start.year == self.end.year:
            return f"{self.start:%b %-d} to {self.end:%b %-d, %Y}"
        return f"{self.start:%b %-d, %Y} to {self.end:%b %-d, %Y}"

    def as_dict(self) -> dict[str, str]:
        return {"name": self.name, "start": self.start.isoformat(), "end": self.end.isoformat(), "label": self.label()}


def today_in(tz: str) -> date:
    return datetime.now(ZoneInfo(tz)).date()


def month_start(d: date) -> date:
    return d.replace(day=1)


def month_end(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def add_months(d: date, months: int) -> date:
    total = d.year * 12 + d.month - 1 + months
    year, month = divmod(total, 12)
    day = min(d.day, calendar.monthrange(year, month + 1)[1])
    return date(year, month + 1, day)


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def parse_month(value: str) -> date:
    year, month = value.split("-")[:2]
    return date(int(year), int(month), 1)


def month_elapsed_fraction(today: date, month: date) -> float:
    start, end = month_start(month), month_end(month)
    if today < start:
        return 0.0
    if today >= end:
        return 1.0
    return today.day / end.day


def resolve_period(
    name: str, today: date, start: date | None = None, end: date | None = None
) -> Period:
    if name == "custom":
        if not start or not end:
            raise ValueError("Custom periods need a start and end date")
        if end < start:
            raise ValueError("Period end is before start")
        return Period(name, start, end)
    if name == "today":
        return Period(name, today, today)
    if name == "yesterday":
        y = today - timedelta(days=1)
        return Period(name, y, y)
    if name == "this_week":
        s = today - timedelta(days=today.weekday())
        return Period(name, s, today)
    if name == "last_week":
        s = today - timedelta(days=today.weekday() + 7)
        return Period(name, s, s + timedelta(days=6))
    if name == "this_month":
        return Period(name, month_start(today), today)
    if name == "last_month":
        prev = add_months(month_start(today), -1)
        return Period(name, prev, month_end(prev))
    if name == "last_30_days":
        return Period(name, today - timedelta(days=29), today)
    if name == "last_90_days":
        return Period(name, today - timedelta(days=89), today)
    if name == "last_3_months":
        return Period(name, add_months(month_start(today), -3), month_end(add_months(month_start(today), -1)))
    if name == "last_6_months":
        return Period(name, add_months(month_start(today), -6), month_end(add_months(month_start(today), -1)))
    if name == "this_year":
        return Period(name, date(today.year, 1, 1), today)
    if name == "last_year":
        return Period(name, date(today.year - 1, 1, 1), date(today.year - 1, 12, 31))
    if name == "all_time":
        return Period(name, date(2000, 1, 1), today)
    raise ValueError(f"Unknown period: {name}")


def previous_comparable(period: Period) -> Period:
    if period.name in {"this_month", "last_month"} or period.start.day == 1:
        prev_start = add_months(period.start, -1)
        span = (period.end - period.start).days
        prev_end = min(prev_start + timedelta(days=span), month_end(prev_start))
        return Period(f"previous_{period.name}", prev_start, prev_end)
    length = period.days
    return Period(
        f"previous_{period.name}", period.start - timedelta(days=length), period.start - timedelta(days=1)
    )
