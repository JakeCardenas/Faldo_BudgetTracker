import json
import uuid

import pytest
from sqlalchemy import func, select

from app.ai.rag.retriever import search_memory
from app.ai.tools.registry import tool_specs
from app.core.db import scoped_session
from app.engine.periods import today_in
from app.jobs.worker import drain
from app.models import MemoryDocument, User
from app.seed.demo import DEMO_EMAIL, seed
from tests.conftest import ApiClient, make_user

TODAY = today_in("Asia/Manila")


@pytest.fixture(scope="module")
async def demo(app):
    await seed(reset=True)
    client = ApiClient(transport=__import__("httpx").ASGITransport(app=app), base_url="http://test")
    r = await client.post("/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": "faldo-demo-2026"})
    assert r.status_code == 200, r.text
    yield client
    await client.aclose()


async def ask(client: ApiClient, message: str) -> dict:  # type: ignore[type-arg]
    r = await client.post("/api/v1/assistant/messages", json={"message": message})
    assert r.status_code == 200, r.text
    events: dict[str, list] = {}  # type: ignore[type-arg]
    for chunk in r.text.strip().split("\n\n"):
        lines = chunk.split("\n")
        name = lines[0].removeprefix("event: ")
        events.setdefault(name, []).append(json.loads(lines[1].removeprefix("data: ")))
    assert "error" not in events, events.get("error")
    text = "".join(e["text"] for e in events.get("delta", []))
    return {"text": text, "done": events["done"][0], "blocks": events["blocks"][0]["blocks"],
            "status": events.get("status", [])}


def test_tool_schemas_are_strict():
    for spec in tool_specs():
        params = spec["parameters"]
        assert params["type"] == "object" and params["additionalProperties"] is False
        assert set(params["required"]) == set(params.get("properties", {}))
        assert "$defs" not in json.dumps(params)


async def test_seed_indexes_memory_and_retrieval_finds_items(demo):
    me = (await demo.get("/api/v1/me")).json()
    uid = uuid.UUID(me["id"])
    async with scoped_session(uid) as db:
        count = await db.scalar(select(func.count(MemoryDocument.id)).where(MemoryDocument.user_id == uid))
        assert count and count > 400
        hits = await search_memory(db, uid, "shoes sneakers", entity_types=["transaction_item", "transaction"])
        names = " ".join(h.content for h in hits)
        assert "Nike Air Force 1" in names and "Adidas Samba" in names
        notes = await search_memory(db, uid, "Carlo tuition", entity_types=["financial_note", "debt"])
        assert notes and "Carlo" in notes[0].content


async def test_retrieval_never_crosses_users(demo, app):
    demo_id = uuid.UUID((await demo.get("/api/v1/me")).json()["id"])
    stranger = await make_user(app, "Stranger")
    stranger_id = uuid.UUID((await stranger.get("/api/v1/me")).json()["id"])
    async with scoped_session(stranger_id) as db:
        assert await search_memory(db, stranger_id, "Nike shoes Jollibee salary") == []
        assert await search_memory(db, demo_id, "Nike shoes Jollibee salary") == []
    r = await stranger.get("/api/v1/search", params={"q": "Nike"})
    assert r.json()["transactions"] == [] and r.json()["memory"] == []
    await stranger.aclose()


async def test_new_transactions_are_indexed_by_worker(app):
    client = await make_user(app, "Indexer")
    uid = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    account = (await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 100000})).json()
    await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 89_900, "occurred_on": TODAY.isoformat(), "account_id": account["id"],
        "merchant": "Datablitz", "items": [{"name": "Mechanical keyboard", "amount_minor": 89_900}]})
    await drain()
    async with scoped_session(uid) as db:
        hits = await search_memory(db, uid, "keyboard")
        assert any("Mechanical keyboard" in h.content for h in hits)
    await client.aclose()


async def test_capture_parse_flags_ambiguity(demo):
    r = await demo.post("/api/v1/capture/parse", json={"text": "Spent ₱350 at Jollibee"})
    draft = r.json()["drafts"][0]
    assert draft["amount_minor"] == 35_000 and draft["category_name"] == "Food & Dining"
    assert draft["learned_from_history"] is True
    assert any(i["code"] == "account_unknown" for i in draft["issues"])
    r = await demo.post("/api/v1/capture/parse", json={"text": "grab 250 via gcash last week"})
    draft = r.json()["drafts"][0]
    codes = {i["code"] for i in draft["issues"]}
    assert "date_unclear" in codes and draft["account_name"] == "GCash"
    r = await demo.post("/api/v1/capture/parse", json={"text": "what a nice day"})
    assert r.json()["is_financial"] is False


QUESTIONS = [
    "Where did my money go this month?",
    "How much did I spend on food?",
    "Have I been spending more than last month?",
    "Can I afford a ₱3,000 purchase?",
    "When can I afford my MacBook?",
    "What are my biggest expenses?",
    "How much have I spent on shoes this year?",
    "Why am I running out of money?",
    "What subscriptions do I have?",
    "How much am I saving each month?",
    "What should I reduce this month?",
    "What happens if I spend ₱5,000 this weekend?",
]


@pytest.mark.parametrize("question", QUESTIONS)
async def test_assistant_answers_are_grounded(demo, question):
    result = await ask(demo, question)
    assert result["text"]
    assert result["done"]["validation"] == "passed", result["text"]
    assert result["done"]["tool_calls"], "assistant must use tools"
    assert all(call["ok"] for call in result["done"]["tool_calls"]), result["done"]["tool_calls"]


async def test_affordability_card_matches_calculation(demo):
    result = await ask(demo, "Can I afford ₱3,000 headphones?")
    calc = next(b for b in result["blocks"] if b["type"] == "calculation")
    total = sum(line["amount_minor"] if line["op"] in {"start", "add"} else -line["amount_minor"] for line in calc["lines"])
    assert total == calc["result_minor"]
    assert any(line["amount_minor"] == 300_000 for line in calc["lines"])


async def test_shoes_total_is_computed_from_items(demo):
    result = await ask(demo, "How much have I spent on shoes this year?")
    names = [c["name"] for c in result["done"]["tool_calls"]]
    assert names[0] == "get_category_spending"
    assert "₱" in result["text"]


async def test_dashboard_and_reports_for_demo(demo):
    dash = (await demo.get("/api/v1/dashboard")).json()
    assert dash["has_data"] and dash["overview"]["expense_minor"] > 0
    shares = sum(row["pct"] for row in dash["spending_by_category"])
    assert 99.0 <= shares <= 101.0
    insights = (await demo.get("/api/v1/insights")).json()
    assert insights and all(i["facts"] for i in insights)
    pulse = (await demo.get("/api/v1/pulse")).json()
    assert pulse["text"] and pulse["generated_by"] == "template"
    report = (await demo.get("/api/v1/reports/monthly")).json()
    assert report["summary"]["expense_minor"] == dash["overview"]["expense_minor"]
    summary = (await demo.get("/api/v1/reports/summary")).json()
    assert "₱" in summary["text"]
    health = (await demo.get("/api/v1/health")).json()
    assert health["score"] is not None and len(health["components"]) == 6
    scenario = (await demo.post("/api/v1/forecast/scenario", json={"adjustments": [{"kind": "one_time_expense", "amount_minor": 500_000}]})).json()
    assert scenario["delta_minor"] == -500_000


async def test_receipt_without_vision_provider_is_honest(demo):
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (400, 600), "white").save(buf, format="PNG")
    r = await demo.post("/api/v1/receipts", files={"file": ("receipt.png", buf.getvalue(), "image/png")})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "unavailable" and body["extraction"] is None and "isn't set up" in body["error"]
    r = await demo.post("/api/v1/receipts", files={"file": ("bad.png", b"not an image", "image/png")})
    assert r.status_code == 415


async def test_demo_user_exists_once():
    async with scoped_session(None) as db:
        assert await db.scalar(select(func.count(User.id)).where(User.email == DEMO_EMAIL)) == 1
