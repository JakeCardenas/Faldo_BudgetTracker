import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from app.api.deps import CtxDep
from app.jobs.queue import enqueue_index, enqueue_unindex
from app.models import FinancialNote
from app.models.enums import TransactionType
from app.schemas.ledger import (
    AccountIn,
    AccountOut,
    AccountUpdate,
    CategoryIn,
    CategoryOut,
    CategoryUpdate,
    MerchantOut,
    NoteIn,
    NoteOut,
    TransactionIn,
    TransactionList,
    TransactionOut,
)
from app.services import accounts as account_service
from app.services import categories as category_service
from app.services import transactions as txn_service
from app.services.common import get_owned

router = APIRouter()


@router.get("/accounts", response_model=list[AccountOut], tags=["accounts"])
async def list_accounts(ctx: CtxDep, include_archived: bool = False) -> list[AccountOut]:
    balances = await account_service.account_balances(ctx.db, ctx.user_id, include_archived=include_archived)
    return [account_service.to_out(b) for b in balances]


@router.post("/accounts", response_model=AccountOut, status_code=201, tags=["accounts"])
async def create_account(data: AccountIn, ctx: CtxDep) -> AccountOut:
    account = await account_service.create_account(ctx.db, ctx.user_id, ctx.currency, data)
    if ctx.settings.default_account_id is None and account.is_spendable:
        ctx.settings.default_account_id = account.id
    balances = await account_service.account_balances(ctx.db, ctx.user_id)
    return account_service.to_out(next(b for b in balances if b.account.id == account.id))


@router.get("/accounts/{account_id}", response_model=AccountOut, tags=["accounts"])
async def get_account(account_id: uuid.UUID, ctx: CtxDep) -> AccountOut:
    balances = await account_service.account_balances(ctx.db, ctx.user_id)
    match = next((b for b in balances if b.account.id == account_id), None)
    if match is None:
        from app.core.errors import NotFound

        raise NotFound("Account not found.")
    return account_service.to_out(match)


@router.get("/accounts/{account_id}/history", tags=["accounts"])
async def account_history(account_id: uuid.UUID, ctx: CtxDep, days: Annotated[int, Query(ge=7, le=365)] = 90) -> list[dict]:
    from datetime import timedelta

    from app.models import Account

    await get_owned(ctx.db, Account, account_id, ctx.user_id, "Account")
    points = []
    step = max(1, days // 30)
    for offset in range(days, -1, -step):
        day = ctx.today - timedelta(days=offset)
        balances = await account_service.account_balances(ctx.db, ctx.user_id, as_of=day)
        value = next((b.balance_minor for b in balances if b.account.id == account_id), 0)
        points.append({"date": day.isoformat(), "balance_minor": value})
    return points


@router.patch("/accounts/{account_id}", response_model=AccountOut, tags=["accounts"])
async def update_account(account_id: uuid.UUID, data: AccountUpdate, ctx: CtxDep) -> AccountOut:
    await account_service.update_account(ctx.db, ctx.user_id, account_id, data)
    balances = await account_service.account_balances(ctx.db, ctx.user_id)
    return account_service.to_out(next(b for b in balances if b.account.id == account_id))


@router.delete("/accounts/{account_id}", status_code=204, tags=["accounts"])
async def delete_account(account_id: uuid.UUID, ctx: CtxDep) -> Response:
    await account_service.delete_account(ctx.db, ctx.user_id, account_id)
    if ctx.settings.default_account_id == account_id:
        ctx.settings.default_account_id = None
    return Response(status_code=204)


@router.get("/categories", response_model=list[CategoryOut], tags=["categories"])
async def list_categories(ctx: CtxDep) -> list[CategoryOut]:
    return [CategoryOut.model_validate(c) for c in await category_service.list_categories(ctx.db, ctx.user_id)]


@router.post("/categories", response_model=CategoryOut, status_code=201, tags=["categories"])
async def create_category(data: CategoryIn, ctx: CtxDep) -> CategoryOut:
    return CategoryOut.model_validate(await category_service.create_category(ctx.db, ctx.user_id, data))


@router.patch("/categories/{category_id}", response_model=CategoryOut, tags=["categories"])
async def update_category(category_id: uuid.UUID, data: CategoryUpdate, ctx: CtxDep) -> CategoryOut:
    category = await category_service.update_category(ctx.db, ctx.user_id, category_id, data)
    return CategoryOut.model_validate(category)


@router.delete("/categories/{category_id}", status_code=204, tags=["categories"])
async def delete_category(category_id: uuid.UUID, ctx: CtxDep) -> Response:
    for transaction_id in await category_service.delete_category(ctx.db, ctx.user_id, category_id):
        await enqueue_index(ctx.db, ctx.user_id, "transaction", transaction_id)
    return Response(status_code=204)


@router.get("/tags", tags=["transactions"])
async def list_tags(ctx: CtxDep) -> list[dict[str, str]]:
    from app.models import Tag

    rows = (await ctx.db.execute(select(Tag).where(Tag.user_id == ctx.user_id).order_by(Tag.name))).scalars().all()
    return [{"id": str(t.id), "name": t.name} for t in rows]


@router.get("/merchants", response_model=list[MerchantOut], tags=["transactions"])
async def list_merchants(ctx: CtxDep, q: Annotated[str | None, Query(max_length=80)] = None) -> list[MerchantOut]:
    return [MerchantOut.model_validate(m) for m in await txn_service.list_merchants(ctx.db, ctx.user_id, q)]


@router.get("/transactions", response_model=TransactionList, tags=["transactions"])
async def list_transactions(
    ctx: CtxDep,
    q: Annotated[str | None, Query(max_length=80)] = None,
    type: Annotated[list[TransactionType] | None, Query()] = None,
    account_id: Annotated[list[uuid.UUID] | None, Query()] = None,
    category_id: Annotated[list[uuid.UUID] | None, Query()] = None,
    tag: Annotated[str | None, Query(max_length=40)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    min_amount_minor: Annotated[int | None, Query(ge=0)] = None,
    max_amount_minor: Annotated[int | None, Query(ge=0)] = None,
    sort: txn_service.SortKey = "date_desc",
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    cursor: Annotated[str | None, Query(max_length=40)] = None,
) -> TransactionList:
    filters = txn_service.TransactionFilters(
        q=q, types=type, account_ids=account_id, category_ids=category_id, tag=tag, date_from=date_from, date_to=date_to,
        min_amount_minor=min_amount_minor, max_amount_minor=max_amount_minor,
    )
    return await txn_service.list_transactions(ctx.db, ctx.user_id, filters, sort, limit, cursor)


@router.post("/transactions", response_model=TransactionOut, status_code=201, tags=["transactions"])
async def create_transaction(data: TransactionIn, ctx: CtxDep) -> TransactionOut:
    return txn_service.to_out(await txn_service.create_transaction(ctx.db, ctx.user_id, data))


@router.get("/transactions/{transaction_id}", response_model=TransactionOut, tags=["transactions"])
async def get_transaction(transaction_id: uuid.UUID, ctx: CtxDep) -> TransactionOut:
    return txn_service.to_out(await txn_service.get_transaction(ctx.db, ctx.user_id, transaction_id))


@router.put("/transactions/{transaction_id}", response_model=TransactionOut, tags=["transactions"])
async def update_transaction(transaction_id: uuid.UUID, data: TransactionIn, ctx: CtxDep) -> TransactionOut:
    return txn_service.to_out(await txn_service.update_transaction(ctx.db, ctx.user_id, transaction_id, data))


@router.delete("/transactions/{transaction_id}", status_code=204, tags=["transactions"])
async def delete_transaction(transaction_id: uuid.UUID, ctx: CtxDep) -> Response:
    await txn_service.delete_transaction(ctx.db, ctx.user_id, transaction_id)
    return Response(status_code=204)


@router.get("/notes", response_model=list[NoteOut], tags=["notes"])
async def list_notes(ctx: CtxDep) -> list[NoteOut]:
    rows = (await ctx.db.execute(select(FinancialNote).where(FinancialNote.user_id == ctx.user_id)
                                 .order_by(FinancialNote.created_at.desc()))).scalars().all()
    return [NoteOut.model_validate(n) for n in rows]


@router.post("/notes", response_model=NoteOut, status_code=201, tags=["notes"])
async def create_note(data: NoteIn, ctx: CtxDep) -> NoteOut:
    note = FinancialNote(user_id=ctx.user_id, content=data.content, related_goal_id=data.related_goal_id)
    ctx.db.add(note)
    await ctx.db.flush()
    await ctx.db.refresh(note)
    await enqueue_index(ctx.db, ctx.user_id, "financial_note", note.id)
    return NoteOut.model_validate(note)


@router.delete("/notes/{note_id}", status_code=204, tags=["notes"])
async def delete_note(note_id: uuid.UUID, ctx: CtxDep) -> Response:
    note = await get_owned(ctx.db, FinancialNote, note_id, ctx.user_id, "Note")
    await ctx.db.delete(note)
    await enqueue_unindex(ctx.db, ctx.user_id, "financial_note", note_id)
    return Response(status_code=204)
