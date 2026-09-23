"""Free AI limits go to chats and receipts: the pieces that only reword numbers ask the AI as rarely as they can."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.ai import factory
from app.core.db import scoped_session
from app.engine.periods import today_in
from app.models import AIInsight
from app.services import pulse
from tests.conftest import make_user

TODAY = today_in("Asia/Manila")


class Writer:
    """An AI that rewrites the draft word for word (so the numbers check passes), counting how often it's asked."""

    name = "gemini"
    is_development = False
    supports_vision = True

    def __init__(self) -> None:
        self.asked = 0

    async def write_summary(self, kind: str, facts: dict[str, Any], draft: str) -> str | None:
        self.asked += 1
        return draft


async def _spend(client: Any, account: dict[str, Any], amount: int) -> None:
    r = await client.post("/api/v1/transactions", json={"type": "expense", "amount_minor": amount, "account_id": account["id"],
                                                        "occurred_on": TODAY.isoformat()})
    assert r.status_code == 201, r.text


async def test_the_reports_summary_is_written_once_per_change_in_your_data(app, monkeypatch):
    writer = Writer()
    monkeypatch.setattr(factory, "get_llm", lambda: writer)
    client = await make_user(app, "Reports")
    account = (await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 500_000})).json()
    await _spend(client, account, 25_000)
    first = (await client.get("/api/v1/reports/summary")).json()
    again = (await client.get("/api/v1/reports/summary")).json()
    assert writer.asked == 1 and first["text"] == again["text"] and again["generated_by"] == "gemini"
    await _spend(client, account, 10_000)
    (await client.get("/api/v1/reports/summary")).json()
    assert writer.asked == 2, "new data, new summary"
    assert all(i["type"] != "report_summary" for i in (await client.get("/api/v1/insights")).json()), "not an insight card"
    await client.aclose()


async def test_the_home_pulse_asks_the_ai_at_most_once_an_hour(app, monkeypatch):
    writer = Writer()
    monkeypatch.setattr(pulse, "get_llm", lambda: writer)
    client = await make_user(app, "Pulse")
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    account = (await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 500_000})).json()
    await _spend(client, account, 25_000)
    assert (await client.get("/api/v1/pulse")).json()["generated_by"] == "gemini" and writer.asked == 1
    await _spend(client, account, 10_000)
    fresh = (await client.get("/api/v1/pulse")).json()
    assert writer.asked == 1 and fresh["generated_by"] == "template" and "₱" in fresh["text"], "the numbers stay current"
    async with scoped_session(uid) as db:
        row = (await db.execute(select(AIInsight).where(AIInsight.user_id == uid, AIInsight.type == "pulse"))).scalar_one()
        row.facts = {**row.facts, "_ai_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat()}
    await _spend(client, account, 5_000)
    assert (await client.get("/api/v1/pulse")).json()["generated_by"] == "gemini" and writer.asked == 2
    await client.aclose()
