from datetime import date, timedelta

from app.engine.check import affordable_on
from app.engine.periods import today_in

P = 100
TODAY = today_in("Asia/Manila")


def test_affordable_on_estimates():
    d = date(2026, 9, 21)
    assert affordable_on(5_000 * P, 8_000 * P, None, d) == d
    assert affordable_on(5_000 * P, 2_000 * P, 3_000 * P, d) == d + timedelta(days=31)
    assert affordable_on(5_000 * P, -1_000 * P, 5_000 * P, d) == d + timedelta(days=31)
    assert affordable_on(5_000 * P, 0, 0, d) is None
    assert affordable_on(5_000 * P, 0, None, d) is None


async def test_planned_purchases_are_checked_and_can_be_bought(client, other_client):
    account = (await client.post("/api/v1/accounts", json={"name": "GCash", "type": "e_wallet", "opening_balance_minor": 4_000 * P})).json()
    await client.patch("/api/v1/me/settings", json={"safe_to_spend_buffer_minor": 0})
    small = await client.post("/api/v1/planned-purchases", json={"name": "Earbuds", "amount_minor": 1_500 * P, "pause_hours": 24,
                                                                  "url": "https://shopee.ph/item/1"})
    assert small.status_code == 201, small.text
    body = small.json()
    assert body["is_paused"] is True and body["verdict"] in {"fits", "stretch"} and body["affordable_on"] == TODAY.isoformat()
    big = (await client.post("/api/v1/planned-purchases", json={"name": "Laptop", "amount_minor": 60_000 * P, "priority": "high"})).json()
    assert big["verdict"] == "over" and big["over_by_minor"] == 56_000 * P
    assert big["affordable_on"] is None and big["affordable_is_estimate"] is True  # no full months of history yet

    bad_url = await client.post("/api/v1/planned-purchases", json={"name": "X", "amount_minor": 100, "url": "javascript:alert(1)"})
    assert bad_url.status_code == 422

    # Another user can't see, change, buy or delete it, or buy with someone else's account.
    assert (await other_client.get("/api/v1/planned-purchases")).json() == []
    assert (await other_client.patch(f"/api/v1/planned-purchases/{big['id']}", json={"status": "dropped"})).status_code == 404
    assert (await other_client.post(f"/api/v1/planned-purchases/{big['id']}/buy", json={"account_id": account["id"]})).status_code == 404
    assert (await other_client.delete(f"/api/v1/planned-purchases/{big['id']}")).status_code == 404
    their_account = (await other_client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash"})).json()
    assert (await client.post(f"/api/v1/planned-purchases/{body['id']}/buy", json={"account_id": their_account["id"]})).status_code == 404

    bought = await client.post(f"/api/v1/planned-purchases/{body['id']}/buy", json={"account_id": account["id"]})
    assert bought.status_code == 200, bought.text
    assert bought.json()["status"] == "bought" and bought.json()["bought_transaction_id"]
    balance = next(a["balance_minor"] for a in (await client.get("/api/v1/accounts")).json() if a["id"] == account["id"])
    assert balance == 2_500 * P
    assert (await client.post(f"/api/v1/planned-purchases/{body['id']}/buy", json={"account_id": account["id"]})).status_code == 400

    dropped = await client.patch(f"/api/v1/planned-purchases/{big['id']}", json={"status": "dropped"})
    assert dropped.json()["status"] == "dropped" and dropped.json()["verdict"] is None
    assert (await client.delete(f"/api/v1/planned-purchases/{big['id']}")).status_code == 204


async def test_new_tables_are_row_level_isolated(client, other_client):
    import uuid

    from sqlalchemy import text

    from app.core.db import scoped_session

    await client.post("/api/v1/planned-purchases", json={"name": "Bag", "amount_minor": 900 * P})
    account = (await client.post("/api/v1/accounts", json={"name": "Cash", "type": "cash", "opening_balance_minor": 1_000 * P})).json()
    await client.post("/api/v1/debts", json={"direction": "owed_to_me", "counterparty": "Mark", "amount_minor": 100 * P,
                                             "account_id": account["id"]})
    mine = (await client.get("/api/v1/me")).json()["id"]
    other = (await other_client.get("/api/v1/me")).json()["id"]
    async with scoped_session(uuid.UUID(other)) as db:
        assert (await db.execute(text("SELECT count(*) FROM planned_purchases"))).scalar() == 0
        assert (await db.execute(text("SELECT count(*) FROM transactions WHERE debt_id IS NOT NULL"))).scalar() == 0
    async with scoped_session(uuid.UUID(mine)) as db:
        assert (await db.execute(text("SELECT count(*) FROM planned_purchases"))).scalar() == 1
        assert (await db.execute(text("SELECT count(*) FROM transactions WHERE debt_id IS NOT NULL"))).scalar() == 1
