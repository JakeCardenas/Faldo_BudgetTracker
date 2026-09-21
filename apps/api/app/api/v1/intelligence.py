import datetime as dt
import json
import uuid
from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, File, Query, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import Field, StringConstraints
from sqlalchemy import func, or_, select

from app.ai.assistant.service import list_conversations, message_out, stream_answer
from app.ai.capture.service import parse_capture
from app.ai.factory import get_llm
from app.ai.rag.retriever import search_memory
from app.api.deps import CtxDep
from app.core.config import get_settings
from app.core.errors import AppError, NotFound
from app.core.rate_limit import limiter
from app.engine.periods import month_end, parse_month
from app.engine.scenarios import Adjustment, adjustment_total
from app.models import (
    Account,
    AIConversation,
    AIInsight,
    AIMessage,
    Category,
    Merchant,
    SavingsGoal,
    TransactionItem,
)
from app.models.enums import InsightStatus, TransactionSource
from app.schemas.common import ApiModel
from app.schemas.ledger import TransactionIn, TransactionOut
from app.services import check as check_service
from app.services import dashboard, forecast, health, insights, pulse, receipts, reports
from app.services.common import get_owned
from app.services.transactions import TransactionFilters, create_transaction, list_transactions
from app.services.transactions import to_out as txn_out
from app.storage.files import get_storage

router = APIRouter()
MonthQuery = Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


@router.get("/dashboard", tags=["dashboard"])
async def get_dashboard(ctx: CtxDep, range: Literal["this_month", "last_month", "last_30_days", "last_90_days", "this_year"] = "this_month") -> dict[str, Any]:
    return await dashboard.dashboard(ctx.db, ctx.user_id, ctx.settings, ctx.today, range)


@router.get("/pulse", tags=["dashboard"])
async def get_pulse(ctx: CtxDep) -> dict[str, Any]:
    return await pulse.get_pulse(ctx.db, ctx.user_id, ctx.settings, ctx.today)


@router.get("/reports/monthly", tags=["reports"])
async def monthly_report(ctx: CtxDep, month: MonthQuery = None) -> dict[str, Any]:
    target = parse_month(month) if month else ctx.today
    if target > ctx.today:
        raise AppError("That month hasn't started yet.")
    data = await reports.monthly_report(ctx.db, ctx.user_id, target, ctx.today)
    data["health"] = await health.health_score(ctx.db, ctx.user_id, ctx.today)
    return data


@router.get("/reports/summary", tags=["reports"])
async def report_summary(ctx: CtxDep, month: MonthQuery = None) -> dict[str, Any]:
    target = parse_month(month) if month else ctx.today
    return await reports.report_summary(ctx.db, ctx.user_id, target, ctx.today, ctx.currency)


@router.get("/health", tags=["reports"])
async def financial_health(ctx: CtxDep) -> dict[str, Any]:
    return await health.health_score(ctx.db, ctx.user_id, ctx.today)


@router.get("/forecast", tags=["forecast"])
async def get_forecast(ctx: CtxDep, horizon: Literal["end_of_month", "30_days", "60_days", "90_days"] = "end_of_month") -> dict[str, Any]:
    data = await forecast.forecast(ctx.db, ctx.user_id, ctx.settings, ctx.today, horizon)
    data["safe_to_spend"] = await forecast.safe_to_spend(ctx.db, ctx.user_id, ctx.settings, ctx.today)
    return data


class AdjustmentIn(ApiModel):
    kind: Literal["one_time_expense", "one_time_income", "extra_savings", "reduce_savings", "income_decrease"]
    amount_minor: Annotated[int, Field(gt=0, le=10_000_000_000_00)]
    date: dt.date | None = None
    label: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None
    category_id: uuid.UUID | None = None
    repeat: Literal["once", "daily", "weekly", "monthly"] = "once"


class ScenarioIn(ApiModel):
    adjustments: list[AdjustmentIn] = Field(min_length=1, max_length=8)
    horizon: Literal["end_of_month", "30_days", "60_days", "90_days", "6_months", "12_months"] = "end_of_month"


LABELS = {"one_time_expense": "Planned expense", "one_time_income": "Extra income", "extra_savings": "Extra savings",
          "reduce_savings": "Reduced savings", "income_decrease": "Less income"}


@router.post("/forecast/scenario", tags=["forecast"])
async def run_scenario(data: ScenarioIn, ctx: CtxDep) -> dict[str, Any]:
    from app.services.budgets import budget_status

    tomorrow = ctx.today + timedelta(days=1)
    adjustments = []
    budget_impacts: list[dict[str, Any]] = []
    status = await budget_status(ctx.db, ctx.user_id, ctx.today, ctx.today)
    for adj in data.adjustments:
        on = max(adj.date or tomorrow, tomorrow)
        if on > ctx.today + timedelta(days=366):
            raise AppError("Scenarios can look at most a year ahead.")
        adjustment = Adjustment(adj.kind, adj.amount_minor, on, adj.label or LABELS[adj.kind],
                                str(adj.category_id) if adj.category_id else None, adj.repeat)
        adjustments.append(adjustment)
        if adj.category_id and adj.kind == "one_time_expense":
            line = next((line for line in status.lines if line.category_id == adj.category_id), None)
            this_month = adjustment_total(adjustment, month_end(ctx.today))
            if line and this_month:
                budget_impacts.append({"category": line.category_name, "remaining_before_minor": line.remaining_minor,
                                       "remaining_after_minor": line.remaining_minor - this_month,
                                       "limit_minor": line.limit_minor})
    result = await forecast.scenario(ctx.db, ctx.user_id, ctx.settings, ctx.today, adjustments, data.horizon,
                                     budget_over=any(b["remaining_after_minor"] < 0 for b in budget_impacts))
    result["budget_impacts"] = budget_impacts
    return result


class CheckIn(ApiModel):
    amount_minor: Annotated[int, Field(gt=0, le=10_000_000_000_00)]
    category_id: uuid.UUID | None = None
    label: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None


@router.post("/check", tags=["forecast"])
async def faldo_check(data: CheckIn, ctx: CtxDep) -> dict[str, Any]:
    """What this purchase does to Safe to Spend, this week, a budget and your goals. Calculated, never generated."""
    return await check_service.check_purchase(ctx.db, ctx.user_id, ctx.settings, ctx.today, data.amount_minor,
                                              data.category_id, data.label)


@router.get("/insights", tags=["insights"])
async def list_insights(ctx: CtxDep, refresh: bool = True, include_dismissed: bool = False) -> list[dict[str, Any]]:
    if refresh:
        await insights.refresh_insights(ctx.db, ctx.user_id, ctx.settings, ctx.today)
    rows = await insights.list_insights(ctx.db, ctx.user_id, include_dismissed)
    return [{"id": str(i.id), "type": i.type, "severity": i.severity.value, "title": i.title, "body": i.body,
             "facts": i.facts, "evidence": i.evidence, "status": i.status.value, "period": i.period_key,
             "created_at": i.created_at.isoformat()} for i in rows]


@router.post("/insights/{insight_id}/dismiss", status_code=204, tags=["insights"])
async def dismiss_insight(insight_id: uuid.UUID, ctx: CtxDep) -> Response:
    insight = await get_owned(ctx.db, AIInsight, insight_id, ctx.user_id, "Insight")
    insight.status = InsightStatus.dismissed
    return Response(status_code=204)


class CaptureIn(ApiModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@router.post("/capture/parse", tags=["capture"])
async def capture_parse(data: CaptureIn, ctx: CtxDep) -> dict[str, Any]:
    await limiter.hit(f"capture:{ctx.user_id}", get_settings().capture_requests_per_hour, 3600)
    return await parse_capture(ctx.db, ctx.user_id, ctx.settings, ctx.today, data.text)


class CaptureConfirmIn(ApiModel):
    transactions: list[TransactionIn] = Field(min_length=1, max_length=10)


@router.post("/capture/confirm", response_model=list[TransactionOut], status_code=201, tags=["capture"])
async def capture_confirm(data: CaptureConfirmIn, ctx: CtxDep) -> list[TransactionOut]:
    created = []
    for item in data.transactions:
        if item.occurred_on > ctx.today:
            raise AppError("Transactions can't be dated in the future.")
        created.append(txn_out(await create_transaction(ctx.db, ctx.user_id, item, TransactionSource.natural_language)))
    return created


def _receipt_out(r: Any) -> dict[str, Any]:
    return {"id": str(r.id), "status": r.status.value, "provider": r.provider, "extraction": r.extraction,
            "issues": r.validation_issues, "error": r.error, "transaction_id": str(r.transaction_id) if r.transaction_id else None,
            "has_image": bool(r.storage_key), "created_at": r.created_at.isoformat()}


@router.post("/receipts", status_code=201, tags=["receipts"])
async def upload_receipt(ctx: CtxDep, file: Annotated[UploadFile, File()]) -> dict[str, Any]:
    cfg = get_settings()
    await limiter.hit(f"receipt:{ctx.user_id}", cfg.receipt_uploads_per_day, 86400)
    data = await file.read(cfg.receipt_max_bytes + 1)
    receipt = await receipts.upload_receipt(ctx.db, ctx.user_id, data)
    return _receipt_out(receipt)


@router.get("/receipts", tags=["receipts"])
async def list_receipts(ctx: CtxDep) -> list[dict[str, Any]]:
    from app.models import Receipt
    from app.models.enums import ReceiptStatus

    rows = (await ctx.db.execute(
        select(Receipt).where(Receipt.user_id == ctx.user_id,
                              Receipt.status.in_([ReceiptStatus.processing, ReceiptStatus.needs_review, ReceiptStatus.unavailable, ReceiptStatus.failed]))
        .order_by(Receipt.created_at.desc()).limit(20)
    )).scalars().all()
    return [_receipt_out(r) for r in rows]


@router.get("/receipts/{receipt_id}", tags=["receipts"])
async def get_receipt(receipt_id: uuid.UUID, ctx: CtxDep) -> dict[str, Any]:
    return _receipt_out(await receipts.get_receipt(ctx.db, ctx.user_id, receipt_id))


@router.get("/receipts/{receipt_id}/image", tags=["receipts"])
async def receipt_image(receipt_id: uuid.UUID, ctx: CtxDep) -> Response:
    receipt = await receipts.get_receipt(ctx.db, ctx.user_id, receipt_id)
    if not receipt.storage_key:
        raise NotFound("Image not available.")
    return Response(await get_storage(ctx.db, ctx.user_id).get(receipt.storage_key), media_type=receipt.mime_type,
                    headers={"Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff"})


@router.post("/receipts/{receipt_id}/confirm", response_model=TransactionOut, tags=["receipts"])
async def confirm_receipt(receipt_id: uuid.UUID, data: TransactionIn, ctx: CtxDep) -> TransactionOut:
    return txn_out(await receipts.confirm_receipt(ctx.db, ctx.user_id, receipt_id, data))


@router.delete("/receipts/{receipt_id}", status_code=204, tags=["receipts"])
async def discard_receipt(receipt_id: uuid.UUID, ctx: CtxDep) -> Response:
    await receipts.discard_receipt(ctx.db, ctx.user_id, receipt_id)
    return Response(status_code=204)


class AskIn(ApiModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    conversation_id: uuid.UUID | None = None
    page_context: Annotated[str, StringConstraints(max_length=120)] | None = None


@router.post("/assistant/messages", tags=["assistant"])
async def ask(data: AskIn, ctx: CtxDep) -> StreamingResponse:
    await limiter.hit(f"assistant:{ctx.user_id}", get_settings().assistant_messages_per_hour, 3600)
    if data.conversation_id:
        await get_owned(ctx.db, AIConversation, data.conversation_id, ctx.user_id, "Conversation")
    user_id, settings, today = ctx.user_id, ctx.settings, ctx.today

    async def events() -> AsyncIterator[str]:
        try:
            async for event in stream_answer(user_id, settings, today, data.message, data.conversation_id, data.page_context):
                yield f"event: {event['event']}\ndata: {json.dumps(event['data'], default=str)}\n\n"
        except Exception:
            import logging

            logging.getLogger("faldo.assistant").exception("Assistant stream failed")
            yield f"event: error\ndata: {json.dumps({'message': 'Something went wrong while answering. Please try again.'})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


@router.get("/assistant/conversations", tags=["assistant"])
async def conversations(ctx: CtxDep) -> list[dict[str, Any]]:
    return await list_conversations(ctx.user_id)


@router.get("/assistant/conversations/{conversation_id}", tags=["assistant"])
async def conversation_messages(conversation_id: uuid.UUID, ctx: CtxDep) -> dict[str, Any]:
    conversation = await get_owned(ctx.db, AIConversation, conversation_id, ctx.user_id, "Conversation")
    rows = (await ctx.db.execute(select(AIMessage).where(AIMessage.conversation_id == conversation.id)
                                 .order_by(AIMessage.created_at))).scalars().all()
    return {"id": str(conversation.id), "title": conversation.title, "messages": [message_out(m) for m in rows]}


@router.delete("/assistant/conversations/{conversation_id}", status_code=204, tags=["assistant"])
async def delete_conversation(conversation_id: uuid.UUID, ctx: CtxDep) -> Response:
    conversation = await get_owned(ctx.db, AIConversation, conversation_id, ctx.user_id, "Conversation")
    await ctx.db.delete(conversation)
    return Response(status_code=204)


@router.get("/assistant/status", tags=["assistant"])
async def assistant_status(ctx: CtxDep) -> dict[str, Any]:
    provider = get_llm()
    return {"provider": provider.name, "is_development": provider.is_development, "supports_vision": provider.supports_vision}


@router.get("/search", tags=["search"])
async def global_search(ctx: CtxDep, q: Annotated[str, Query(min_length=1, max_length=80)]) -> dict[str, Any]:
    pattern = f"%{q.strip()}%"
    txns = await list_transactions(ctx.db, ctx.user_id, TransactionFilters(q=q), limit=6)
    merchants = (await ctx.db.execute(select(Merchant).where(Merchant.user_id == ctx.user_id, or_(
        Merchant.name.ilike(pattern), func.similarity(Merchant.normalized_name, q.lower()) > 0.35)).limit(5))).scalars().all()
    items = (await ctx.db.execute(select(TransactionItem).where(TransactionItem.user_id == ctx.user_id,
                                                                TransactionItem.name.ilike(pattern)).limit(5))).scalars().all()
    categories = (await ctx.db.execute(select(Category).where(Category.user_id == ctx.user_id, Category.name.ilike(pattern))
                                       .limit(5))).scalars().all()
    goal_rows = (await ctx.db.execute(select(SavingsGoal).where(SavingsGoal.user_id == ctx.user_id, SavingsGoal.name.ilike(pattern))
                                      .limit(5))).scalars().all()
    accounts = (await ctx.db.execute(select(Account).where(Account.user_id == ctx.user_id, or_(
        Account.name.ilike(pattern), Account.institution.ilike(pattern))).limit(5))).scalars().all()
    memory = await search_memory(ctx.db, ctx.user_id, q, entity_types=["monthly_summary", "financial_note", "insight",
                                                                         "recurring_payment", "debt", "budget"], limit=5)
    return {
        "query": q,
        "transactions": [t.model_dump(mode="json") for t in txns.items],
        "merchants": [{"id": str(m.id), "name": m.name} for m in merchants],
        "items": [{"id": str(i.id), "name": i.name, "amount_minor": i.amount_minor, "transaction_id": str(i.transaction_id)}
                  for i in items],
        "categories": [{"id": str(c.id), "name": c.name, "kind": c.kind.value, "color": c.color} for c in categories],
        "goals": [{"id": str(g.id), "name": g.name} for g in goal_rows],
        "accounts": [{"id": str(a.id), "name": a.name, "type": a.type.value} for a in accounts],
        "memory": [{"entity_type": h.entity_type, "entity_id": str(h.entity_id), "title": h.content.split("\n")[0],
                    "snippet": " ".join(h.content.split("\n")[1:3])[:160], "date": h.occurred_on.isoformat() if h.occurred_on else None}
                   for h in memory],
    }

