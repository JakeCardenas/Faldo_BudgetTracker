from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.engine.periods import today_in
from app.engine.statements import StatementError, detect_date_order, parse_amount, parse_date, parse_statement

P = 100
TODAY = today_in("Asia/Manila")
REF_DAY = date(2026, 9, 30)


@pytest.mark.parametrize("raw,expected", [
    ("1,200.50", "1200.50"), ("(350.00)", "-350.00"), ("-80", "-80.00"), ("500.00 DR", "-500.00"), ("500.00 CR", "500.00"),
    ("₱1,200", "1200.00"), ("PHP 99.5", "99.50"), ("P1,000.00", "1000.00"), ("250-", "-250.00"), ("+15", "15.00"),
    ("12.345", "12.35"), ("", None), ("-", None), ("abc", None),
])
def test_parse_amount(raw, expected):  # type: ignore[no-untyped-def]
    value = parse_amount(raw)
    assert (str(value) if value is not None else None) == expected
    if value is not None:
        assert isinstance(value, Decimal)


def test_date_order_detection_and_parsing():
    assert detect_date_order(["09/21/2026", "09/03/2026"]) == ("mdy", False)
    assert detect_date_order(["21/09/2026", "03/09/2026"]) == ("dmy", False)
    assert detect_date_order(["09/03/2026", "10/04/2026"]) == ("mdy", True)
    assert detect_date_order(["2026-09-21 10:22 AM"]) == ("ymd", False)
    assert parse_date("2026-09-21 10:22 AM", "ymd") == date(2026, 9, 21)
    assert parse_date("03/09/2026", "dmy") == date(2026, 9, 3)
    assert parse_date("Sep 21, 2026 2:03 PM", "mdy") == date(2026, 9, 21)
    assert parse_date("21-Sep-26", "mdy") == date(2026, 9, 21)
    assert parse_date("02/30/2026", "mdy") is None


def test_ewallet_layout_with_preamble_debit_credit_and_repeated_reference():
    csv = (
        "GCash Transaction History\nAccount: 0917xxxxxxx\n\n"
        "Date and Time,Description,Reference No.,Debit,Credit,Balance\n"
        "2026-09-20 08:10 AM,Payment to JOLLIBEE,1001,180.00,,1820.00\n"
        "2026-09-20 08:10 AM,Service fee,1001,2.00,,1818.00\n"
        "2026-09-21 09:00 AM,Received from Mark,1002,,500.00,2318.00\n"
        "2026-09-21 09:30 AM,Cash-in from BPI,1003,,1000.00,3318.00\n"
        ",,,,,\nTotal,,,182.00,1500.00,\n"
    )
    parsed = parse_statement(csv, today=REF_DAY)
    assert parsed.columns["debit"] == "Debit" and parsed.date_order == "ymd"
    amounts = [r.amount_minor for r in parsed.rows]
    assert amounts == [-180 * P, -2 * P, 500 * P, 1000 * P]
    assert [r.fingerprint for r in parsed.rows][:2] == ["ref:1001", "ref:1001#2"]
    assert parsed.rows[0].balance_minor == 1820 * P
    assert parsed.errors == []  # the "Total" line has no date, so it's ignored quietly


def test_single_amount_layouts():
    signed = parse_statement("Date,Details,Amount\n09/01/2026,Salary,20000\n09/02/2026,Grab,-250.50\n", today=REF_DAY)
    assert [r.amount_minor for r in signed.rows] == [20000 * P, -25050] and signed.signs_guessed is False
    positive = parse_statement("Date,Details,Amount\n09/01/2026,Netflix,549\n09/02/2026,Shopee,1200\n", today=REF_DAY)
    assert [r.amount_minor for r in positive.rows] == [-549 * P, -1200 * P] and positive.signs_guessed is True
    kept = parse_statement("Date,Details,Amount\n09/01/2026,Refund,549\n", today=REF_DAY, invert=False)
    assert kept.rows[0].amount_minor == 549 * P
    direction = parse_statement("Posting Date;Particulars;Amount;DR/CR\n01/09/2026;ATM;1000;DR\n15/09/2026;Payroll;15000;CR\n",
                                today=REF_DAY)
    assert direction.date_order == "dmy" and [r.amount_minor for r in direction.rows] == [-1000 * P, 15000 * P]


def test_same_line_twice_gets_distinct_but_stable_fingerprints():
    body = "Date,Description,Amount\n09/20/2026,Coffee,-120\n09/20/2026,Coffee,-120\n"
    first = [r.fingerprint for r in parse_statement(body, today=REF_DAY).rows]
    again = [r.fingerprint for r in parse_statement(body, today=REF_DAY).rows]
    assert len(set(first)) == 2 and first == again


def test_bad_files_and_rows():
    with pytest.raises(StatementError):
        parse_statement("hello,world\n1,2\n", today=REF_DAY)
    with pytest.raises(StatementError):
        parse_statement("", today=REF_DAY)
    parsed = parse_statement("Date,Description,Amount\n13/45/2026,Bad date,-10\n09/20/2026,No amount,abc\n10/05/2026,Later,-5\n"
                             "09/19/2026,Fine,-99\n", today=REF_DAY)
    assert [r.description for r in parsed.rows] == ["Fine"]
    assert [e["line"] for e in parsed.errors] == [2, 3, 4]


async def _account(client, name="GCash", type_="e_wallet", opening=5_000 * P):  # type: ignore[no-untyped-def]
    return (await client.post("/api/v1/accounts", json={"name": name, "type": type_, "opening_balance_minor": opening})).json()


def _csv(rows: list[tuple[date, str, str, str]]) -> bytes:
    lines = ["Date,Description,Reference No.,Debit,Credit"]
    lines += [f"{d.isoformat()},{desc},,{debit},{credit}" for d, desc, debit, credit in rows]
    return ("\n".join(lines) + "\n").encode()


async def _preview(client, account_id: str, data: bytes, **form):  # type: ignore[no-untyped-def]
    return await client.post("/api/v1/imports/preview", data={"account_id": account_id, **form},
                             files={"file": ("statement.csv", data, "text/csv")})


async def test_import_flow_duplicates_transfers_and_undo(client, other_client):
    gcash = await _account(client)
    bpi = await _account(client, "BPI", "bank", 20_000 * P)
    d1, d2 = TODAY - timedelta(days=3), TODAY - timedelta(days=1)
    await client.post("/api/v1/transactions", json={"type": "expense", "amount_minor": 180 * P, "occurred_on": d1.isoformat(),
                                                     "account_id": gcash["id"], "merchant": "Jollibee"})
    data = _csv([(d1, "Payment to JOLLIBEE", "180.00", ""), (d1, "Starbucks Coffee", "165.00", ""),
                 (d2, "Cash-in from BPI", "", "1000.00"), (d2, "Salary", "", "20000.00")])
    r = await _preview(client, gcash["id"], data)
    assert r.status_code == 200, r.text
    preview = r.json()
    rows = {row["description"]: row for row in preview["rows"]}
    assert rows["Payment to JOLLIBEE"]["status"] == "possible_duplicate" and rows["Payment to JOLLIBEE"]["include"] is False
    assert rows["Starbucks Coffee"]["merchant"] == "Starbucks" and rows["Starbucks Coffee"]["category_id"]
    assert rows["Cash-in from BPI"]["kind"] == "transfer" and rows["Cash-in from BPI"]["counter_account_id"] == bpi["id"]
    assert rows["Salary"]["amount_minor"] == 20_000 * P and rows["Salary"]["include"] is True
    assert preview["summary"]["possible_duplicates"] == 1 and preview["summary"]["transfers"] == 1

    keys = ("external_ref", "line", "occurred_on", "description", "amount_minor", "kind", "counter_account_id", "category_id", "merchant")
    chosen = [{k: row[k] for k in keys} for row in preview["rows"] if row["include"] or row["kind"] == "transfer"]
    r = await client.post("/api/v1/imports", json={"account_id": gcash["id"], "file_name": "statement.csv", "rows": chosen})
    assert r.status_code == 201, r.text
    assert r.json() == {"batch_id": r.json()["batch_id"], "imported": 3, "skipped": 0}

    balances = {a["id"]: a["balance_minor"] for a in (await client.get("/api/v1/accounts")).json()}
    assert balances[gcash["id"]] == (5_000 - 180 - 165 + 1_000 + 20_000) * P
    assert balances[bpi["id"]] == (20_000 - 1_000) * P  # the cash-in was a transfer, not income
    imported = (await client.get("/api/v1/transactions", params={"type": ["income"]})).json()
    assert imported["total_income_minor"] == 20_000 * P and imported["items"][0]["source"] == "import"

    again = (await _preview(client, gcash["id"], data)).json()
    assert again["summary"]["already_imported"] == 3 and again["summary"]["new"] == 1
    replay = await client.post("/api/v1/imports", json={"account_id": gcash["id"], "rows": chosen})
    assert replay.json() == {"batch_id": None, "imported": 0, "skipped": 3}

    batches = (await client.get("/api/v1/imports")).json()
    assert batches[0]["imported"] == 3 and batches[0]["account_name"] == "GCash"

    # Isolation: nobody else can preview into, import into, or undo against this user's data.
    assert (await _preview(other_client, gcash["id"], data)).status_code == 404
    theirs = await _account(other_client, "Mine")
    bad_transfer = [{**chosen[1], "counter_account_id": bpi["id"], "external_ref": "row:zzzz"}]
    assert (await other_client.post("/api/v1/imports", json={"account_id": theirs["id"], "rows": bad_transfer})).status_code == 404
    assert (await other_client.delete(f"/api/v1/imports/{batches[0]['id']}")).status_code == 404

    # BPI's side of the same cash-in, imported later, is recognised instead of doubling the transfer.
    bpi_side = (await _preview(client, bpi["id"], _csv([(d2, "Transfer to GCash", "1000.00", "")]))).json()
    assert bpi_side["rows"][0]["status"] == "possible_duplicate" and bpi_side["rows"][0]["include"] is False

    undo = await client.delete(f"/api/v1/imports/{batches[0]['id']}")
    assert undo.json() == {"removed": 3}
    balances = {a["id"]: a["balance_minor"] for a in (await client.get("/api/v1/accounts")).json()}
    assert balances[gcash["id"]] == (5_000 - 180) * P and balances[bpi["id"]] == 20_000 * P


async def test_import_validation(client):
    gcash = await _account(client)
    cats = (await client.get("/api/v1/categories")).json()
    salary = next(c["id"] for c in cats if c["name"] == "Salary")
    row = {"external_ref": "row:abcd", "occurred_on": TODAY.isoformat(), "description": "Food", "amount_minor": -100 * P,
           "category_id": salary}
    assert (await client.post("/api/v1/imports", json={"account_id": gcash["id"], "rows": [row]})).status_code == 400
    future = {**row, "category_id": None, "occurred_on": (TODAY + timedelta(days=2)).isoformat()}
    assert (await client.post("/api/v1/imports", json={"account_id": gcash["id"], "rows": [future]})).status_code == 400
    transfer = {**row, "category_id": None, "kind": "transfer"}
    assert (await client.post("/api/v1/imports", json={"account_id": gcash["id"], "rows": [transfer]})).status_code == 400
    assert (await _preview(client, gcash["id"], b"no,columns,here\n1,2,3\n")).status_code == 400
    assert (await _preview(client, gcash["id"], b"x" * (2 * 1024 * 1024 + 10))).status_code == 413
