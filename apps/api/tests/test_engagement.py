from datetime import date, timedelta

from app.engine.periods import today_in
from app.services.engagement import best_streak, current_streak

TODAY = today_in("Asia/Manila")


def days(*offsets: int, anchor: date = date(2026, 9, 15)) -> set[date]:
    return {anchor - timedelta(days=o) for o in offsets}


def test_streak_counts_today_or_yesterday():
    anchor = date(2026, 9, 15)
    assert current_streak(days(0, 1, 2, anchor=anchor), anchor) == (3, 2)
    assert current_streak(days(1, 2, anchor=anchor), anchor) == (2, 2)
    assert current_streak(days(3, 4, anchor=anchor), anchor) == (0, 2)
    assert current_streak(set(), anchor) == (0, 2)


def test_streak_restores_bridge_single_gaps_this_month_only():
    anchor = date(2026, 9, 15)
    assert current_streak(days(0, 2, 3, anchor=anchor), anchor) == (4, 1)
    assert current_streak(days(0, 2, 4, 5, anchor=anchor), anchor) == (6, 0)
    assert current_streak(days(0, 2, 4, 6, anchor=anchor), anchor) == (5, 0)
    early = date(2026, 9, 1)
    assert current_streak(days(0, 2, 3, anchor=early), early) == (1, 2)


def test_best_streak():
    assert best_streak(days(0, 1, 2, 5, 6)) == 3
    assert best_streak(set()) == 0


async def test_engagement_streak_and_poses(client):
    account = (await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash"})).json()
    for offset in range(3):
        await client.post("/api/v1/transactions", json={
            "type": "expense", "amount_minor": 100, "account_id": account["id"],
            "occurred_on": (TODAY - timedelta(days=offset)).isoformat()})
    data = (await client.get("/api/v1/engagement")).json()
    assert data["current_streak"] == 3 and data["logged_today"] and data["best_streak"] == 3
    assert "badges" not in data and "backgrounds" not in data
    poses = {o["id"]: o for o in data["outfits"]}
    assert poses["classic"]["unlocked"] and poses["bucket_hat"]["unlocked"]
    assert poses["scarf"] == {"id": "scarf", "unlocked": False, "progress": 3, "target": 7}
    assert poses["headphones"] == {"id": "headphones", "unlocked": False, "progress": 0, "target": 1}
    assert [d["logged"] for d in data["week"]][-3:] == [True, True, True]

    assert (await client.patch("/api/v1/me/settings", json={"mascot_outfit": "bucket_hat"})).status_code == 200
    locked = await client.patch("/api/v1/me/settings", json={"mascot_outfit": "crown"})
    assert locked.status_code == 400
    assert (await client.patch("/api/v1/me/settings", json={"mascot_outfit": "tuxedo"})).status_code == 400
    r = await client.patch("/api/v1/me/settings", json={"theme": "dark", "quick_actions": ["budgets", "goals"],
                                                        "completed_lessons": ["budget-50-30-20", "budget-50-30-20"]})
    assert r.status_code == 200
    settings = r.json()["settings"]
    assert settings["theme"] == "dark" and settings["mascot_outfit"] == "bucket_hat"
    assert settings["completed_lessons"] == ["budget-50-30-20"] and "home_background" not in settings
    assert (await client.patch("/api/v1/me/settings", json={"theme": "neon"})).status_code == 422


async def test_account_order_and_balance_history(client):
    names = ["Cash", "GCash", "BPI"]
    ids = [(await client.post("/api/v1/accounts", json={"name": n, "type": "cash", "opening_balance_minor": 1000}))
           .json()["id"] for n in names]
    card = (await client.post("/api/v1/accounts", json={"name": "Card", "type": "credit_card", "credit_limit_minor": 100_000})).json()
    await client.post("/api/v1/transactions", json={"type": "expense", "amount_minor": 500, "account_id": card["id"],
                                                    "occurred_on": TODAY.isoformat()})
    assert [a["name"] for a in (await client.get("/api/v1/accounts")).json()] == [*names, "Card"]
    assert (await client.put("/api/v1/accounts/order", json={"ids": [ids[2], ids[0]]})).status_code == 204
    assert [a["name"] for a in (await client.get("/api/v1/accounts")).json()] == ["BPI", "Cash", "GCash", "Card"]
    assert (await client.put("/api/v1/accounts/order", json={"ids": [ids[0], ids[0]]})).status_code == 400

    history = (await client.get("/api/v1/accounts/balance-history", params={"days": 7})).json()
    assert len(history) == 8 and history[-1]["date"] == TODAY.isoformat()
    assert history[-1] == {"date": TODAY.isoformat(), "assets_minor": 3000, "liabilities_minor": 500, "net_minor": 2500}
