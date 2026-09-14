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

RECEIPT_SCHEMA = _obj({
    "is_receipt": {"type": "boolean"},
    "merchant": _nullable({"type": "string"}),
    "branch": _nullable({"type": "string"}),
    "date": _nullable({"type": "string", "description": "YYYY-MM-DD"}),
    "currency": _nullable({"type": "string"}),
    "items": {"type": "array", "items": ITEM_SCHEMA},
    "subtotal": _nullable({"type": "number"}),
    "discount": _nullable({"type": "number"}),
    "tax": _nullable({"type": "number"}),
    "service_charge": _nullable({"type": "number"}),
    "total": _nullable({"type": "number"}),
    "payment_method": _nullable({"type": "string"}),
    "suggested_category": _nullable({"type": "string"}),
    "legibility": {"type": "string", "enum": ["good", "fair", "poor"]},
})
