from typing import Any


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    kind = schema["type"]
    return {**schema, "type": [kind, "null"] if isinstance(kind, str) else [*kind, "null"]}


def _obj(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "additionalProperties": False, "required": list(properties), "properties": properties}


ITEM_SCHEMA = _obj({
    "name": {"type": "string"},
    "quantity": _nullable({"type": "number"}),
    "amount": _nullable({"type": "number"}),
})

CAPTURE_SCHEMA = _obj({
    "transactions": {
        "type": "array",
        "items": _obj({
            "type": {"type": "string", "enum": ["expense", "income", "transfer"]},
            "amount": _nullable({"type": "number"}),
            "date": {"type": "string", "description": "YYYY-MM-DD"},
            "date_certain": {"type": "boolean"},
            "merchant": _nullable({"type": "string"}),
            "category": _nullable({"type": "string"}),
            "subcategory": _nullable({"type": "string"}),
            "category_alternatives": {"type": "array", "items": {"type": "string"}},
            "account": _nullable({"type": "string"}),
            "to_account": _nullable({"type": "string"}),
            "payment_method": _nullable({"type": "string"}),
            "items": {"type": "array", "items": ITEM_SCHEMA},
            "notes": _nullable({"type": "string"}),
        }),
    },
    "is_financial": {"type": "boolean"},
})

DOCUMENT_TYPES = ["store_receipt", "restaurant_bill", "online_order", "ewallet_transfer", "bank_transfer", "utility_bill",
                  "invoice", "fuel", "ride_or_delivery", "atm_slip", "payslip", "other", "not_financial"]

RECEIPT_SCHEMA = _obj({
    "is_receipt": {"type": "boolean", "description": "True for any receipt, bill, invoice or payment screenshot that shows money"},
    "document_type": {"type": "string", "enum": DOCUMENT_TYPES},
    "direction": {"type": "string", "enum": ["expense", "income", "transfer"],
                  "description": "expense when the user paid or sent money, income when they received it"},
    "merchant": _nullable({"type": "string", "description": "Store, biller, platform shop, or the person paid or paid by"}),
    "branch": _nullable({"type": "string"}),
    "date": _nullable({"type": "string", "description": "YYYY-MM-DD of the payment or purchase"}),
    "time": _nullable({"type": "string", "description": "HH:MM, 24-hour"}),
    "currency": _nullable({"type": "string", "description": "ISO code like PHP or USD"}),
    "items": {"type": "array", "items": ITEM_SCHEMA},
    "subtotal": _nullable({"type": "number"}),
    "discount": _nullable({"type": "number", "description": "Discounts and vouchers, as a positive number"}),
    "tax": _nullable({"type": "number"}),
    "service_charge": _nullable({"type": "number"}),
    "fees": _nullable({"type": "number", "description": "Delivery, shipping, transfer or convenience fees"}),
    "total": _nullable({"type": "number", "description": "The amount actually paid, sent or received; for an unpaid bill, the amount due"}),
    "due_date": _nullable({"type": "string", "description": "YYYY-MM-DD, for bills"}),
    "reference": _nullable({"type": "string", "description": "Reference, transaction, order or OR number"}),
    "payment_method": _nullable({"type": "string", "description": "Cash, card, GCash, Maya, a bank, SPayLater…"}),
    "paid_from": _nullable({"type": "string", "description": "The wallet, bank or card the money came from or went to, as shown"}),
    "card_last4": _nullable({"type": "string", "description": "Last four digits of a card or account, if printed"}),
    "suggested_category": _nullable({"type": "string"}),
    "description": _nullable({"type": "string", "description": "A short note, like 'Meralco bill for August' or 'Grab ride'"}),
    "legibility": {"type": "string", "enum": ["good", "fair", "poor"]},
})
