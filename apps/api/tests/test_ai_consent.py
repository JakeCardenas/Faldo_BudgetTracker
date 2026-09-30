"""Nothing personal goes to an outside AI service until the person allows the services configured right now, and a
newly configured one asks again. Declining keeps Faldo working on its own rules. The Privacy page can list the services
without anyone signed in, and never shows a key."""

import io
import uuid
from typing import Any

import pytest
from PIL import Image
from pydantic import SecretStr

from app.ai import consent
from app.ai.assistant import service as assistant_service
from app.ai.capture import service as capture_service
from app.core.config import get_settings
from app.core.db import scoped_session
from app.engine.periods import today_in
from app.models import UserSettings
from app.services import receipts
from tests.conftest import make_user
from tests.test_ai_limits import Outside
from tests.test_receipts import BLANK, Reader

pytestmark = pytest.mark.real_consent

SECRET = "AIza-test-key-that-must-never-show"


@pytest.fixture
def configured(monkeypatch):
    """This server set up with Gemini (and optionally Groq) keys."""
    def use(*names: str, paid: bool = False) -> None:
        keys = {"gemini": "gemini_api_key", "groq": "groq_api_key"}
        update: dict[str, Any] = {"ai_provider": names[0], "gemini_paid_tier": paid, "gemini_api_key": None, "groq_api_key": None}
        for name in names:
            update[keys[name]] = SecretStr(SECRET)
        settings = get_settings().model_copy(update=update)
        monkeypatch.setattr(consent, "get_settings", lambda: settings)
    return use


async def _person(app) -> tuple[Any, uuid.UUID]:  # type: ignore[no-untyped-def]
    client = await make_user(app, "Consent")
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 100_000})
    return client, uid


async def _ask(uid: uuid.UUID, provider: Any, monkeypatch) -> dict[str, Any]:
    monkeypatch.setattr(assistant_service, "get_llm", lambda: provider)
    async with scoped_session(uid) as db:
        settings = await db.get(UserSettings, uid)
    assert settings is not None
    events = [e async for e in assistant_service.stream_answer(uid, settings, today_in(settings.timezone),
                                                               "How much did I spend this month?", None, None)]
    return next(e["data"] for e in events if e["event"] == "done")


class Gemini(Outside):
    name = "gemini"


async def test_nothing_goes_outside_until_the_person_allows_it(app, configured, monkeypatch):
    configured("gemini")
    client, uid = await _person(app)
    me = (await client.get("/api/v1/me")).json()
    assert me["ai"]["needs_consent"] is True and me["ai"]["consent"] == "unset"
    assert [p["name"] for p in me["ai"]["providers"]] == ["Google Gemini API"]
    assert "balances" in me["ai"]["sends"]

    gemini = Gemini()
    assert (await _ask(uid, gemini, monkeypatch))["provider"] == "local" and gemini.calls == 0

    r = await client.put("/api/v1/me/ai-consent", json={"choice": "allowed"})
    assert r.status_code == 200 and r.json()["ai"]["allowed"] is True and r.json()["ai"]["needs_consent"] is False
    assert (await _ask(uid, gemini, monkeypatch))["provider"] == "gemini" and gemini.calls > 0
    await client.aclose()


async def test_a_newly_configured_service_asks_again(app, configured, monkeypatch):
    configured("gemini")
    client, uid = await _person(app)
    await client.put("/api/v1/me/ai-consent", json={"choice": "allowed"})
    configured("gemini", "groq")
    me = (await client.get("/api/v1/me")).json()
    assert me["ai"]["needs_consent"] is True and me["ai"]["allowed"] is False

    class Groq(Outside):
        name = "groq"

    groq = Groq()
    assert (await _ask(uid, groq, monkeypatch))["provider"] == "local" and groq.calls == 0, "not agreed to yet"
    await client.aclose()


async def test_declining_keeps_everything_on_faldos_own_rules(app, configured, monkeypatch):
    configured("gemini")
    client, uid = await _person(app)
    r = await client.put("/api/v1/me/ai-consent", json={"choice": "declined"})
    assert r.json()["ai"]["consent"] == "declined" and r.json()["ai"]["needs_consent"] is False
    assert r.json()["ai_provider"] == "local"

    gemini = Gemini()
    assert (await _ask(uid, gemini, monkeypatch))["provider"] == "local"
    monkeypatch.setattr(capture_service, "get_llm", lambda: gemini)
    parsed = (await client.post("/api/v1/capture/parse", json={"text": "something at the mall kanina"})).json()
    assert parsed["parser"] == "rules"

    class GeminiReader(Reader):
        name = "gemini"

    reader = GeminiReader({**BLANK, "merchant": "Mercury Drug", "total": 250})
    monkeypatch.setattr(receipts, "vision_readers", lambda: [reader])
    image = io.BytesIO()
    Image.new("RGB", (40, 40), "white").save(image, format="PNG")
    receipt = (await client.post("/api/v1/receipts", files={"file": ("r.png", image.getvalue(), "image/png")})).json()
    assert receipt["status"] == "unavailable" and "haven't allowed" in receipt["error"] and not reader.seen
    retry = await client.post(f"/api/v1/receipts/{receipt['id']}/retry")
    assert retry.status_code == 400 and "haven't allowed" in retry.json()["detail"]
    assert gemini.calls == 0
    await client.aclose()


async def test_the_privacy_page_can_list_the_services_without_a_key(anon, configured):
    configured("gemini")
    body = (await anon.get("/api/v1/ai/providers")).text
    assert "Google Gemini API" in body and "free tier" in body and SECRET not in body
    configured("gemini", paid=True)
    body = (await anon.get("/api/v1/ai/providers")).text
    assert "paid tier" in body and "free tier" not in body


async def test_with_only_faldos_own_rules_there_is_nothing_to_ask(app):
    client, _ = await _person(app)
    me = (await client.get("/api/v1/me")).json()
    assert me["ai"]["providers"] == [] and me["ai"]["needs_consent"] is False
    await client.aclose()
