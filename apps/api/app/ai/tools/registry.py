import copy
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.identity import UserSettings

logger = logging.getLogger("faldo.ai.tools")


@dataclass
class ToolContext:
    db: AsyncSession
    user_id: uuid.UUID
    settings: UserSettings
    today: date
    refs: dict[str, dict[str, Any]] = field(default_factory=dict)
    ref_index: dict[str, str] = field(default_factory=dict)

    @property
    def currency(self) -> str:
        return self.settings.currency

    def add_ref(self, prefix: str, key: str, info: dict[str, Any]) -> str:
        if key in self.ref_index:
            ref = self.ref_index[key]
            self.refs[ref].update({k: v for k, v in info.items() if v is not None})
            return ref
        ref = f"{prefix}{sum(1 for r in self.refs if r.startswith(prefix)) + 1}"
        self.ref_index[key] = ref
        self.refs[ref] = info
        return ref


@dataclass
class ToolOutput:
    result: dict[str, Any]
    blocks: list[dict[str, Any]] = field(default_factory=list)


Handler = Callable[[ToolContext, Any], Awaitable[ToolOutput]]


@dataclass
class Tool:
    name: str
    description: str
    args_model: type[BaseModel]
    handler: Handler
    status_label: str


TOOLS: dict[str, Tool] = {}


def tool(name: str, description: str, args_model: type[BaseModel], status_label: str) -> Callable[[Handler], Handler]:
    def decorator(fn: Handler) -> Handler:
        TOOLS[name] = Tool(name, description, args_model, fn, status_label)
        return fn
    return decorator


def _inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    defs = schema.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return resolve(copy.deepcopy(defs[node["$ref"].split("/")[-1]]))
            return {k: resolve(v) for k, v in node.items()}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)


def _strictify(node: Any) -> Any:
    if isinstance(node, dict):
        node = {k: _strictify(v) for k, v in node.items() if k not in {"title", "default"}}
        if node.get("type") == "object" or "properties" in node:
            node["type"] = "object"
            node["additionalProperties"] = False
            node["required"] = list(node.get("properties", {}).keys())
        if "anyOf" in node:
            options = node["anyOf"]
            non_null = [o for o in options if o.get("type") != "null"]
            if len(non_null) == 1 and len(options) == 2 and "type" in non_null[0]:
                merged = dict(non_null[0])
                t = merged["type"]
                merged["type"] = [t, "null"] if isinstance(t, str) else [*t, "null"]
                if "enum" in merged:
                    merged["enum"] = [*merged["enum"], None]
                if "description" in node:
                    merged["description"] = node["description"]
                return merged
        return node
    if isinstance(node, list):
        return [_strictify(v) for v in node]
    return node


def tool_specs() -> list[dict[str, Any]]:
    specs = []
    for t in TOOLS.values():
        schema = _strictify(_inline_refs(t.args_model.model_json_schema()))
        specs.append({"type": "function", "name": t.name, "description": t.description, "parameters": schema, "strict": True})
    return specs


async def run_tool(ctx: ToolContext, name: str, arguments: dict[str, Any]) -> tuple[ToolOutput, dict[str, Any]]:
    started = time.monotonic()
    t = TOOLS.get(name)
    record: dict[str, Any] = {"name": name, "arguments": arguments}
    if t is None:
        output = ToolOutput({"error": f"Unknown tool {name}."})
    else:
        try:
            args = t.args_model.model_validate(arguments)
            async with ctx.db.begin_nested():
                output = await t.handler(ctx, args)
        except ValidationError as exc:
            output = ToolOutput({"error": "Invalid arguments.", "details": [e["msg"] for e in exc.errors()][:5]})
        except (AppError, ValueError) as exc:
            output = ToolOutput({"error": str(exc)})
        except Exception:
            logger.exception("Tool %s failed", name)
            output = ToolOutput({"error": "This calculation failed. Try a simpler question."})
    record["duration_ms"] = round((time.monotonic() - started) * 1000)
    record["ok"] = "error" not in output.result
    return output, record
