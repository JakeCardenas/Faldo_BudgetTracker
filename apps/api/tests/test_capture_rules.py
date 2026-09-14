from datetime import date

from app.ai.capture.rules import parse_with_rules, resolve_date
from app.ai.providers.base import CaptureContext
from app.ai.providers.local_provider import plan

CONTEXT = CaptureContext(
    today="2026-09-14",
    currency="PHP",
    accounts=[
        {"name": "GCash", "type": "e_wallet", "institution": "GCash"},
        {"name": "BPI Payroll", "type": "bank", "institution": "BPI"},
        {"name": "Cash", "type": "cash", "institution": ""},
    ],
    expense_categories=[],
    income_categories=[],
    known_merchants=[],
)


def one(text: str) -> dict:  # type: ignore[type-arg]
    result = parse_with_rules(text, CONTEXT)
    assert len(result["transactions"]) == 1
    return result["transactions"][0]


def test_simple_expense():
    t = one("Spent ₱350 at Jollibee")
    assert t["type"] == "expense" and t["amount"] == 350 and t["merchant"] == "Jollibee"
    assert t["category"] == "Food & Dining" and t["date"] == "2026-09-14" and t["account"] is None


def test_item_with_relative_date():
    t = one("Bought Nike shoes for ₱4,500 yesterday")
    assert t["amount"] == 4500 and t["date"] == "2026-09-13"
    assert t["merchant"] == "Nike" and t["category"] == "Shopping" and t["subcategory"] == "Shoes"
    assert t["items"] and t["items"][0]["name"] == "Nike shoes"


def test_income_and_bill():
    salary = one("Salary ₱30,000")
    assert salary["type"] == "income" and salary["amount"] == 30000 and salary["category"] == "Salary"
    bill = one("Paid electricity ₱2,400")
    assert bill["type"] == "expense" and bill["category"] == "Bills & Utilities" and bill["subcategory"] == "Electricity"


def test_taglish_and_accounts():
    t = one("nag-grab 180 kanina via gcash")
    assert t["merchant"] == "Grab" and t["amount"] == 180 and t["account"] == "GCash"
    assert "Food & Dining" in t["category_alternatives"]
    transfer = one("Transferred 2k from BPI to GCash")
    assert transfer["type"] == "transfer" and transfer["amount"] == 2000
    assert transfer["account"] == "BPI Payroll" and transfer["to_account"] == "GCash"


def test_multiple_transactions_and_unclear_dates():
    result = parse_with_rules("Jollibee 350 and Grab 180", CONTEXT)
    assert [t["amount"] for t in result["transactions"]] == [350, 180]
    assert resolve_date("paid rent last week", date(2026, 9, 14))[1] is False
    assert resolve_date("bought coffee on friday", date(2026, 9, 14))[0] == date(2026, 9, 11)
    assert not parse_with_rules("hello there", CONTEXT)["is_financial"]


def test_local_planner_routes_questions_to_tools():
    cases = {
        "Where did my money go this month?": "get_monthly_expenses",
        "How much did I spend on food?": "get_category_spending",
        "Have I been spending more than last month?": "compare_spending",
        "Can I afford a ₱3,000 purchase?": "calculate_affordability",
        "When can I afford my MacBook?": "get_goal_progress",
        "What are my biggest expenses?": "get_monthly_expenses",
        "How much have I spent on shoes this year?": "get_category_spending",
        "Why am I running out of money?": "compare_spending",
        "What subscriptions do I have?": "get_recurring_payments",
        "What happens if I spend ₱5,000 this weekend?": "simulate_scenario",
        "How much am I saving each month?": "get_savings_summary",
    }
    for question, tool in cases.items():
        _, calls = plan(question)
        assert calls[0].name == tool, question
