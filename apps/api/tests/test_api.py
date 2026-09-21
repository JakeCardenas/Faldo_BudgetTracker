import uuid
from datetime import date, timedelta

from sqlalchemy import select, text

from app.core.db import scoped_session
from app.engine.periods import today_in
from app.models import Account, Transaction

TODAY = today_in("Asia/Manila")


async def _account(client, name="GCash", type_="e_wallet", opening=500_000, **extra):  # type: ignore[no-untyped-def]
    r = await client.post("/api/v1/accounts", json={"name": name, "type": type_, "opening_balance_minor": opening, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def _category(client, name: str, kind: str = "expense") -> str:  # type: ignore[no-untyped-def]
    cats = (await client.get("/api/v1/categories")).json()
    return next(c["id"] for c in cats if c["name"] == name and c["kind"] == kind)


async def test_auth_flow(anon, app):
    r = await anon.get("/api/v1/me")
    assert r.status_code == 401
    email = f"user-{uuid.uuid4().hex[:8]}@example.com"
    r = await anon.post("/api/v1/auth/register", json={"email": email, "password": "short", "display_name": "X"})
    assert r.status_code == 422
    r = await anon.post("/api/v1/auth/register", json={"email": email, "password": "long-enough-password", "display_name": "Jake"})
    assert r.status_code == 201
    assert "faldo_session" in r.cookies and r.json()["settings"]["currency"] == "PHP"
    assert (await anon.get("/api/v1/me")).json()["display_name"] == "Jake"
    assert (await anon.post("/api/v1/auth/logout")).status_code == 204
    anon.cookies.clear()
    assert (await anon.get("/api/v1/me")).status_code == 401
    bad = await anon.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password-123"})
    assert bad.status_code == 401 and "incorrect" in bad.json()["detail"]
    assert (await anon.post("/api/v1/auth/login", json={"email": email, "password": "long-enough-password"})).status_code == 200


async def test_csrf_header_required(client):
    r = await client.post("/api/v1/accounts", json={"name": "X", "type": "cash"}, headers={"x-faldo-client": "other"})
    assert r.status_code == 403
    r = await client.post("/api/v1/accounts", json={"name": "X", "type": "cash"}, headers={"origin": "https://evil.test"})
    assert r.status_code == 403


async def test_transactions_balances_and_filters(client):
    gcash = await _account(client, "GCash", "e_wallet", 500_000)
    bank = await _account(client, "BPI", "bank", 2_000_000)
    card = await _account(client, "Visa", "credit_card", 0, credit_limit_minor=5_000_000)
    food = await _category(client, "Food & Dining")
    salary = await _category(client, "Salary", "income")
    cats = (await client.get("/api/v1/categories")).json()
    shopping = next(c for c in cats if c["name"] == "Shopping" and c["parent_id"] is None)
    shoes = next(c for c in cats if c["name"] == "Shoes" and c["parent_id"] == shopping["id"])

    r = await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 35_000, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"],
        "merchant": "Jollibee", "category_id": food, "tags": ["lunch"], "notes": "Chickenjoy"})
    assert r.status_code == 201, r.text
    lunch = r.json()
    assert lunch["merchant"] == "Jollibee" and lunch["tags"] == ["lunch"]

    r = await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 600_000, "occurred_on": TODAY.isoformat(), "account_id": card["id"],
        "merchant": "Nike Store", "category_id": shopping["id"], "subcategory_id": shoes["id"],
        "items": [{"name": "Nike Shoes", "amount_minor": 450_000}, {"name": "Socks", "amount_minor": 80_000},
                  {"name": "Shirt", "amount_minor": 70_000}]})
    assert r.status_code == 201, r.text
    assert [i["name"] for i in r.json()["items"]] == ["Nike Shoes", "Socks", "Shirt"]

    r = await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 100, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"],
        "items": [{"name": "Too much", "amount_minor": 500}]})
    assert r.status_code == 422

    await client.post("/api/v1/transactions", json={
        "type": "income", "amount_minor": 3_000_000, "occurred_on": TODAY.isoformat(), "account_id": bank["id"], "category_id": salary})
    await client.post("/api/v1/transactions", json={
        "type": "transfer", "amount_minor": 600_000, "occurred_on": TODAY.isoformat(), "account_id": bank["id"], "to_account_id": card["id"]})
    r = await client.post("/api/v1/transactions", json={
        "type": "income", "amount_minor": 100, "occurred_on": TODAY.isoformat(), "account_id": bank["id"], "category_id": food})
    assert r.status_code == 400

    balances = {a["name"]: a["balance_minor"] for a in (await client.get("/api/v1/accounts")).json()}
    assert balances == {"GCash": 465_000, "BPI": 4_400_000, "Visa": 0}

    listing = (await client.get("/api/v1/transactions", params={"q": "socks"})).json()
    assert listing["total_count"] == 1 and listing["items"][0]["merchant"] == "Nike Store"
    listing = (await client.get("/api/v1/transactions", params={"type": "expense", "sort": "amount_desc", "limit": 1})).json()
    assert listing["total_count"] == 2 and listing["total_expense_minor"] == 635_000 and listing["next_cursor"]
    page2 = (await client.get("/api/v1/transactions", params={"type": "expense", "sort": "amount_desc", "limit": 1,
                                                              "cursor": listing["next_cursor"]})).json()
    assert page2["items"][0]["amount_minor"] == 35_000

    update = {**{k: lunch[k] for k in ("type", "occurred_on", "account_id", "merchant", "category_id", "notes")},
              "amount_minor": 42_000, "tags": []}
    r = await client.put(f"/api/v1/transactions/{lunch['id']}", json=update)
    assert r.status_code == 200 and r.json()["amount_minor"] == 42_000 and r.json()["tags"] == []
    assert (await client.delete(f"/api/v1/transactions/{lunch['id']}")).status_code == 204
    assert (await client.get(f"/api/v1/transactions/{lunch['id']}")).status_code == 404
    r = await client.delete(f"/api/v1/accounts/{bank['id']}")
    assert r.status_code == 409


async def test_cross_tenant_isolation(client, other_client):
    account = await _account(client, "Private", "bank", 999_900)
    food = await _category(client, "Food & Dining")
    txn = (await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 12_300, "occurred_on": TODAY.isoformat(), "account_id": account["id"],
        "merchant": "Secret Cafe", "category_id": food})).json()

    assert (await other_client.get(f"/api/v1/transactions/{txn['id']}")).status_code == 404
    assert (await other_client.get(f"/api/v1/accounts/{account['id']}")).status_code == 404
    assert (await other_client.delete(f"/api/v1/transactions/{txn['id']}")).status_code == 404
    other_account = await _account(other_client, "Mine", "cash", 0)
    r = await other_client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 100, "occurred_on": TODAY.isoformat(), "account_id": account["id"]})
    assert r.status_code == 404
    r = await other_client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 100, "occurred_on": TODAY.isoformat(), "account_id": other_account["id"], "category_id": food})
    assert r.status_code == 404
    assert (await other_client.get("/api/v1/transactions", params={"q": "Secret"})).json()["total_count"] == 0

    me = (await client.get("/api/v1/me")).json()
    other_me = (await other_client.get("/api/v1/me")).json()
    async with scoped_session(uuid.UUID(other_me["id"])) as db:
        leaked = (await db.execute(select(Transaction).where(Transaction.user_id == uuid.UUID(me["id"])))).scalars().all()
        assert leaked == []
        assert (await db.execute(select(Account).where(Account.id == uuid.UUID(account["id"])))).scalar_one_or_none() is None
    async with scoped_session(None) as db:
        assert (await db.execute(text("SELECT count(*) FROM transactions"))).scalar() == 0


async def test_budgets_goals_recurring_debts(client):
    gcash = await _account(client, "GCash", "e_wallet", 1_000_000)
    savings = await _account(client, "Savings", "savings", 500_000)
    food = await _category(client, "Food & Dining")
    month = TODAY.strftime("%Y-%m")
    await client.post("/api/v1/transactions", json={
        "type": "expense", "amount_minor": 425_000, "occurred_on": TODAY.isoformat(), "account_id": gcash["id"], "category_id": food})
    r = await client.put("/api/v1/budgets", json={"month": month, "lines": [{"category_id": food, "limit_minor": 500_000}]})
    assert r.status_code == 200, r.text
    line = r.json()["lines"][0]
    assert (line["spent_minor"], line["remaining_minor"], line["pct_used"]) == (425_000, 75_000, 85.0)
    cats = (await client.get("/api/v1/categories")).json()
    sub = next(c for c in cats if c["name"] == "Coffee")
    assert (await client.put("/api/v1/budgets", json={"month": month, "lines": [{"category_id": sub["id"], "limit_minor": 1}]})).status_code == 400

    r = await client.post("/api/v1/goals", json={"name": "MacBook", "target_minor": 7_500_000, "monthly_contribution_minor": 600_000,
                                                 "target_date": (TODAY + timedelta(days=200)).isoformat(), "initial_amount_minor": 1_500_000})
    goal = r.json()
    assert r.status_code == 201 and goal["saved_minor"] == 1_500_000 and goal["pct_complete"] == 20.0
    assert goal["projected_completion_on"] is not None and goal["required_monthly_minor"] > 0
    r = await client.post(f"/api/v1/goals/{goal['id']}/contributions", json={"amount_minor": 500_000, "occurred_on": TODAY.isoformat()})
    assert r.json()["saved_minor"] == 2_000_000

    linked = (await client.post("/api/v1/goals", json={"name": "Emergency", "target_minor": 10_000_000,
                                                       "linked_account_id": savings["id"]})).json()
    assert linked["saved_minor"] == 500_000
    r = await client.post(f"/api/v1/goals/{linked['id']}/contributions",
                          json={"amount_minor": 200_000, "occurred_on": TODAY.isoformat(), "from_account_id": gcash["id"]})
    assert r.json()["saved_minor"] == 700_000

    bill = (await client.post("/api/v1/recurring", json={
        "name": "Netflix", "kind": "subscription", "amount_minor": 54_900, "frequency": "monthly",
        "next_due_on": (TODAY + timedelta(days=2)).isoformat(), "account_id": gcash["id"]})).json()
    assert bill["monthly_equivalent_minor"] == 54_900
    paid = await client.post(f"/api/v1/recurring/{bill['id']}/pay", json={})
    assert paid.status_code == 200 and paid.json()["recurring_payment_id"] == bill["id"]
    after = next(r for r in (await client.get("/api/v1/recurring")).json() if r["id"] == bill["id"])
    assert date.fromisoformat(after["next_due_on"]) > TODAY + timedelta(days=2)

    debt = (await client.post("/api/v1/debts", json={"direction": "owed_to_me", "counterparty": "Mika", "amount_minor": 150_000})).json()
    r = await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 50_000, "paid_on": TODAY.isoformat()})
    assert r.json()["outstanding_minor"] == 100_000 and r.json()["status"] == "open"
    r = await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 200_000, "paid_on": TODAY.isoformat()})
    assert r.status_code == 400
    r = await client.post(f"/api/v1/debts/{debt['id']}/payments", json={"amount_minor": 100_000, "paid_on": TODAY.isoformat()})
    assert r.json()["status"] == "settled"


async def test_empty_user_analytics_do_not_invent_data(client):
    dash = (await client.get("/api/v1/dashboard")).json()
    assert dash["has_data"] is False and dash["overview"]["expense_minor"] == 0 and dash["spending_by_category"] == []
    assert (await client.get("/api/v1/insights")).json() == []
    pulse = (await client.get("/api/v1/pulse")).json()
    assert "No transactions" in pulse["text"]
    fc = (await client.get("/api/v1/forecast")).json()
    assert fc["sufficiency"] == "insufficient" and fc["is_estimate"] is True
    health = (await client.get("/api/v1/health")).json()
    assert health["score"] is None
    report = (await client.get("/api/v1/reports/monthly")).json()
    assert report["summary"]["transaction_count"] == 0


async def test_card_last4_is_optional_and_only_four_digits(client):
    card = await _account(client, "BPI Visa", "credit_card", 0, credit_limit_minor=5_000_000, card_last4="4821")
    assert card["card_last4"] == "4821"
    for bad in ("482", "48211", "4821 5555 1234 0000", "ab12", "٤٨٢١"):
        r = await client.post("/api/v1/accounts", json={"name": f"Card {bad}", "type": "credit_card", "card_last4": bad})
        assert r.status_code == 422, bad
    cleared = await client.patch(f"/api/v1/accounts/{card['id']}", json={"card_last4": None})
    assert cleared.status_code == 200 and cleared.json()["card_last4"] is None
    cash = await _account(client, "Pitaka", "cash", 1_000)
    assert cash["card_last4"] is None
