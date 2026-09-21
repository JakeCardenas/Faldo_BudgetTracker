from datetime import timedelta

from app.engine.periods import today_in

TODAY = today_in("Asia/Manila")
P = 100


async def _account(client, name="GCash", opening=10_000 * P):  # type: ignore[no-untyped-def]
    r = await client.post("/api/v1/accounts", json={"name": name, "type": "e_wallet", "opening_balance_minor": opening})
    assert r.status_code == 201, r.text
    return r.json()


async def _balance(client, account_id: str) -> int:  # type: ignore[no-untyped-def]
    return next(a["balance_minor"] for a in (await client.get("/api/v1/accounts")).json() if a["id"] == account_id)


async def _month_totals(client) -> dict[str, int]:  # type: ignore[no-untyped-def]
    overview = (await client.get("/api/v1/dashboard")).json()["overview"]
    return {"income": overview["income_minor"], "expense": overview["expense_minor"]}


async def _category(client, name: str) -> str:  # type: ignore[no-untyped-def]
    return next(c["id"] for c in (await client.get("/api/v1/categories")).json() if c["name"] == name and c["kind"] == "expense")


async def test_lending_and_repayment_move_money_without_counting_as_income_or_spending(client):
    gcash = await _account(client)
    r = await client.post("/api/v1/debts", json={"direction": "owed_to_me", "counterparty": "Mark", "amount_minor": 2_000 * P,
                                                  "account_id": gcash["id"]})
    assert r.status_code == 201, r.text
    debt = r.json()
    assert debt["account_name"] == "GCash"
    assert await _balance(client, gcash["id"]) == 8_000 * P
    assert await _month_totals(client) == {"income": 0, "expense": 0}

    r = await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 500 * P, "paid_on": TODAY.isoformat(),
                                                                          "account_id": gcash["id"]})
    assert r.status_code == 201, r.text
    assert r.json()["outstanding_minor"] == 1_500 * P
    assert r.json()["payments"][0]["account_name"] == "GCash"
    assert await _balance(client, gcash["id"]) == 8_500 * P
    assert await _month_totals(client) == {"income": 0, "expense": 0}

    r = await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 1_500 * P, "paid_on": TODAY.isoformat(),
                                                                          "account_id": gcash["id"]})
    assert r.json()["status"] == "settled"
    assert await _balance(client, gcash["id"]) == 10_000 * P

    movements = (await client.get("/api/v1/transactions", params={"type": ["debt_in", "debt_out"]})).json()
    assert movements["total_count"] == 3
    assert movements["total_income_minor"] == 0 and movements["total_expense_minor"] == 0


async def test_record_only_debts_do_not_touch_balances(client):
    gcash = await _account(client)
    debt = (await client.post("/api/v1/debts", json={"direction": "i_owe", "counterparty": "Ana", "amount_minor": 1_000 * P})).json()
    await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 400 * P, "paid_on": TODAY.isoformat()})
    assert await _balance(client, gcash["id"]) == 10_000 * P


async def test_borrowing_then_repaying_can_count_the_repayment_as_spending(client):
    gcash = await _account(client)
    food = await _category(client, "Food & Dining")
    debt = (await client.post("/api/v1/debts", json={"direction": "i_owe", "counterparty": "Ana", "amount_minor": 1_500 * P,
                                                      "account_id": gcash["id"]})).json()
    assert await _balance(client, gcash["id"]) == 11_500 * P
    assert await _month_totals(client) == {"income": 0, "expense": 0}

    bad = await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 1_500 * P, "paid_on": TODAY.isoformat(),
                                                                            "category_id": food})
    assert bad.status_code == 400  # counting as spending needs an account the money left

    r = await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 1_500 * P, "paid_on": TODAY.isoformat(),
                                                                          "account_id": gcash["id"], "category_id": food})
    assert r.status_code == 201, r.text
    assert await _balance(client, gcash["id"]) == 10_000 * P
    assert await _month_totals(client) == {"income": 0, "expense": 1_500 * P}


async def test_split_purchase_keeps_only_my_share_as_spending(client):
    gcash = await _account(client)
    food = await _category(client, "Food & Dining")
    txn = (await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 3_500 * P, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"],
        "merchant": "Samgyup House", "category_id": food})).json()

    r = await client.post(f"/api/v1/transactions/{txn['id']}/split", json={"counterparty": "Mark", "amount_minor": 2_000 * P,
                                                                             "due_on": (TODAY + timedelta(days=7)).isoformat()})
    assert r.status_code == 201, r.text
    debt = r.json()
    assert debt["direction"] == "owed_to_me" and debt["source_transaction_id"] == txn["id"]
    mine = (await client.get(f"/api/v1/transactions/{txn['id']}")).json()
    assert mine["amount_minor"] == 1_500 * P
    assert await _month_totals(client) == {"income": 0, "expense": 1_500 * P}
    assert await _balance(client, gcash["id"]) == 6_500 * P  # the full ₱3,500 still left GCash

    await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 1_000 * P, "paid_on": TODAY.isoformat(),
                                                                      "account_id": gcash["id"]})
    assert await _balance(client, gcash["id"]) == 7_500 * P

    r = await client.patch(f"/api/v1/debts/{debt['id']}", json={"amount_minor": 1_750 * P})
    assert r.status_code == 200, r.text
    assert (await client.get(f"/api/v1/transactions/{txn['id']}")).json()["amount_minor"] == 1_750 * P
    assert await _balance(client, gcash["id"]) == 7_500 * P
    assert (await client.patch(f"/api/v1/debts/{debt['id']}", json={"amount_minor": 500 * P})).status_code == 400  # below repaid

    assert (await client.delete(f"/api/v1/debts/{debt['id']}")).status_code == 204
    assert (await client.get(f"/api/v1/transactions/{txn['id']}")).json()["amount_minor"] == 3_500 * P
    assert await _balance(client, gcash["id"]) == 6_500 * P
    assert (await client.get("/api/v1/transactions", params={"type": ["debt_in", "debt_out"]})).json()["total_count"] == 0


async def test_split_validation(client):
    gcash = await _account(client)
    txn = (await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 1_000 * P, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"],
        "items": [{"name": "Pizza", "amount_minor": 900 * P}]})).json()
    too_much = await client.post(f"/api/v1/transactions/{txn['id']}/split", json={"counterparty": "Mark", "amount_minor": 1_000 * P})
    assert too_much.status_code == 400
    items_conflict = await client.post(f"/api/v1/transactions/{txn['id']}/split", json={"counterparty": "Mark", "amount_minor": 500 * P})
    assert items_conflict.status_code == 409
    income = (await client.post("/api/v1/transactions", json={
        "type": "income", "amount_minor": 1_000 * P, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"]})).json()
    assert (await client.post(f"/api/v1/transactions/{income['id']}/split",
                              json={"counterparty": "Mark", "amount_minor": 100 * P})).status_code == 400


async def test_money_owed_movements_are_locked_in_the_ledger(client):
    gcash = await _account(client)
    await client.post("/api/v1/debts", json={"direction": "owed_to_me", "counterparty": "Mark", "amount_minor": 500 * P,
                                             "account_id": gcash["id"]})
    movement = (await client.get("/api/v1/transactions", params={"type": ["debt_out"]})).json()["items"][0]
    assert movement["debt_id"]
    assert (await client.delete(f"/api/v1/transactions/{movement['id']}")).status_code == 409
    edit = await client.put(f"/api/v1/transactions/{movement['id']}", json={
        "type": "expense", "amount_minor": 100, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"]})
    assert edit.status_code == 409
    direct = await client.post("/api/v1/transactions", json={
        "type": "debt_out", "amount_minor": 100, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"]})
    assert direct.status_code == 422


async def test_money_owed_is_isolated_between_users(client, other_client):
    gcash = await _account(client)
    theirs = await _account(other_client, "Their GCash")
    txn = (await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 1_000 * P, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"]})).json()
    debt = (await client.post("/api/v1/debts", json={"direction": "owed_to_me", "counterparty": "Mark", "amount_minor": 500 * P})).json()

    assert (await other_client.post(f"/api/v1/transactions/{txn['id']}/split",
                                    json={"counterparty": "X", "amount_minor": 100 * P})).status_code == 404
    assert (await other_client.post(f"/api/v1/debts/{debt['id']}/payments",
                                    json={"amount_minor": 100 * P, "paid_on": TODAY.isoformat()})).status_code == 404
    assert (await other_client.delete(f"/api/v1/debts/{debt['id']}")).status_code == 404
    # Can't move money through someone else's account.
    assert (await other_client.post("/api/v1/debts", json={"direction": "i_owe", "counterparty": "Y", "amount_minor": 100 * P,
                                                           "account_id": gcash["id"]})).status_code == 404
    assert (await client.post(f"/api/v1/debts/{debt['id']}/payments", json={
        "amount_minor": 100 * P, "paid_on": TODAY.isoformat(), "account_id": theirs["id"]})).status_code == 404
    assert (await client.get("/api/v1/debts")).json()[0]["outstanding_minor"] == 500 * P
    assert await _balance(client, gcash["id"]) == 9_000 * P


async def test_recurring_link_must_belong_to_the_user(client, other_client):
    gcash = await _account(client)
    theirs = (await other_client.post("/api/v1/recurring", json={
        "name": "Netflix", "kind": "subscription", "amount_minor": 549 * P, "frequency": "monthly",
        "next_due_on": (TODAY + timedelta(days=3)).isoformat()})).json()
    r = await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 549 * P, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"],
        "recurring_payment_id": theirs["id"]})
    assert r.status_code == 404
