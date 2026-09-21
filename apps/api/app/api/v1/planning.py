import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import CtxDep
from app.engine.periods import parse_month
from app.schemas.ledger import TransactionOut
from app.schemas.planning import (
    BudgetOut,
    BudgetUpsert,
    ContributionIn,
    DebtIn,
    DebtOut,
    DebtPaymentIn,
    DebtUpdate,
    GoalIn,
    GoalOut,
    GoalUpdate,
    MarkPaidIn,
    PlannedBuyIn,
    PlannedIn,
    PlannedOut,
    PlannedUpdate,
    RecurringIn,
    RecurringOut,
    RecurringUpdate,
)
from app.services import budgets, debts, goals, planned, recurring
from app.services.transactions import to_out as txn_out

router = APIRouter()
MonthQuery = Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


@router.get("/budgets", response_model=BudgetOut, tags=["budgets"])
async def get_budget(ctx: CtxDep, month: MonthQuery = None) -> BudgetOut:
    return await budgets.budget_status(ctx.db, ctx.user_id, parse_month(month) if month else ctx.today, ctx.today)


@router.put("/budgets", response_model=BudgetOut, tags=["budgets"])
async def upsert_budget(data: BudgetUpsert, ctx: CtxDep) -> BudgetOut:
    budget = await budgets.upsert_budget(ctx.db, ctx.user_id, data)
    return await budgets.budget_status(ctx.db, ctx.user_id, budget.month, ctx.today)


@router.post("/budgets/copy-previous", response_model=BudgetOut, tags=["budgets"])
async def copy_budget(ctx: CtxDep, month: Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]) -> BudgetOut:
    budget = await budgets.copy_previous_budget(ctx.db, ctx.user_id, parse_month(month))
    return await budgets.budget_status(ctx.db, ctx.user_id, budget.month, ctx.today)


@router.get("/goals", response_model=list[GoalOut], tags=["goals"])
async def list_goals(ctx: CtxDep, include_archived: bool = False) -> list[GoalOut]:
    return await goals.list_goals(ctx.db, ctx.user_id, ctx.today, include_archived)


@router.post("/goals", response_model=GoalOut, status_code=201, tags=["goals"])
async def create_goal(data: GoalIn, ctx: CtxDep) -> GoalOut:
    goal = await goals.create_goal(ctx.db, ctx.user_id, ctx.currency, data, ctx.today)
    return await goals.get_goal_out(ctx.db, ctx.user_id, goal.id, ctx.today)


@router.get("/goals/{goal_id}", response_model=GoalOut, tags=["goals"])
async def get_goal(goal_id: uuid.UUID, ctx: CtxDep) -> GoalOut:
    return await goals.get_goal_out(ctx.db, ctx.user_id, goal_id, ctx.today)


@router.patch("/goals/{goal_id}", response_model=GoalOut, tags=["goals"])
async def update_goal(goal_id: uuid.UUID, data: GoalUpdate, ctx: CtxDep) -> GoalOut:
    await goals.update_goal(ctx.db, ctx.user_id, goal_id, data)
    return await goals.get_goal_out(ctx.db, ctx.user_id, goal_id, ctx.today)


@router.delete("/goals/{goal_id}", status_code=204, tags=["goals"])
async def delete_goal(goal_id: uuid.UUID, ctx: CtxDep) -> Response:
    await goals.delete_goal(ctx.db, ctx.user_id, goal_id)
    return Response(status_code=204)


@router.post("/goals/{goal_id}/contributions", response_model=GoalOut, status_code=201, tags=["goals"])
async def add_contribution(goal_id: uuid.UUID, data: ContributionIn, ctx: CtxDep) -> GoalOut:
    user_id, today = ctx.user_id, ctx.today
    await goals.add_contribution(ctx.db, user_id, goal_id, data, today)
    return await goals.get_goal_out(ctx.db, user_id, goal_id, today)


@router.get("/recurring", response_model=list[RecurringOut], tags=["recurring"])
async def list_recurring(ctx: CtxDep) -> list[RecurringOut]:
    return await recurring.list_recurring(ctx.db, ctx.user_id, ctx.today)


@router.get("/recurring/upcoming", tags=["recurring"])
async def upcoming(ctx: CtxDep, days: Annotated[int, Query(ge=1, le=120)] = 30) -> list[dict]:
    from datetime import timedelta

    return await recurring.upcoming(ctx.db, ctx.user_id, ctx.today, ctx.today + timedelta(days=days))


async def _recurring_out(ctx: CtxDep, rid: uuid.UUID) -> RecurringOut:
    return next(r for r in await recurring.list_recurring(ctx.db, ctx.user_id, ctx.today) if r.id == rid)


@router.post("/recurring", response_model=RecurringOut, status_code=201, tags=["recurring"])
async def create_recurring(data: RecurringIn, ctx: CtxDep) -> RecurringOut:
    item = await recurring.create_recurring(ctx.db, ctx.user_id, ctx.currency, data)
    return await _recurring_out(ctx, item.id)


@router.patch("/recurring/{rid}", response_model=RecurringOut, tags=["recurring"])
async def update_recurring(rid: uuid.UUID, data: RecurringUpdate, ctx: CtxDep) -> RecurringOut:
    await recurring.update_recurring(ctx.db, ctx.user_id, rid, data)
    return await _recurring_out(ctx, rid)


@router.delete("/recurring/{rid}", status_code=204, tags=["recurring"])
async def delete_recurring(rid: uuid.UUID, ctx: CtxDep) -> Response:
    await recurring.delete_recurring(ctx.db, ctx.user_id, rid)
    return Response(status_code=204)


@router.post("/recurring/{rid}/pay", response_model=TransactionOut, tags=["recurring"])
async def mark_paid(rid: uuid.UUID, data: MarkPaidIn, ctx: CtxDep) -> TransactionOut:
    return txn_out(await recurring.mark_paid(ctx.db, ctx.user_id, rid, data, ctx.today))


@router.post("/recurring/{rid}/skip", response_model=RecurringOut, tags=["recurring"])
async def skip(rid: uuid.UUID, ctx: CtxDep) -> RecurringOut:
    await recurring.skip_occurrence(ctx.db, ctx.user_id, rid)
    return await _recurring_out(ctx, rid)


@router.get("/debts", response_model=list[DebtOut], tags=["debts"])
async def list_debts(ctx: CtxDep) -> list[DebtOut]:
    return await debts.list_debts(ctx.db, ctx.user_id, ctx.today)


@router.post("/debts", response_model=DebtOut, status_code=201, tags=["debts"])
async def create_debt(data: DebtIn, ctx: CtxDep) -> DebtOut:
    return await debts.create_debt(ctx.db, ctx.user_id, ctx.currency, data, ctx.today)


@router.patch("/debts/{debt_id}", response_model=DebtOut, tags=["debts"])
async def update_debt(debt_id: uuid.UUID, data: DebtUpdate, ctx: CtxDep) -> DebtOut:
    return await debts.update_debt(ctx.db, ctx.user_id, debt_id, data, ctx.today)


@router.delete("/debts/{debt_id}", status_code=204, tags=["debts"])
async def delete_debt(debt_id: uuid.UUID, ctx: CtxDep) -> Response:
    await debts.delete_debt(ctx.db, ctx.user_id, debt_id)
    return Response(status_code=204)


@router.post("/debts/{debt_id}/payments", response_model=DebtOut, status_code=201, tags=["debts"])
async def add_debt_payment(debt_id: uuid.UUID, data: DebtPaymentIn, ctx: CtxDep) -> DebtOut:
    return await debts.add_payment(ctx.db, ctx.user_id, debt_id, data, ctx.today)


async def _planned_out(ctx: CtxDep, pid: uuid.UUID) -> PlannedOut:
    return next(p for p in await planned.list_planned(ctx.db, ctx.user_id, ctx.settings, ctx.today) if p.id == pid)


@router.get("/planned-purchases", response_model=list[PlannedOut], tags=["planned"])
async def list_planned(ctx: CtxDep) -> list[PlannedOut]:
    return await planned.list_planned(ctx.db, ctx.user_id, ctx.settings, ctx.today)


@router.post("/planned-purchases", response_model=PlannedOut, status_code=201, tags=["planned"])
async def create_planned(data: PlannedIn, ctx: CtxDep) -> PlannedOut:
    item = await planned.create_planned(ctx.db, ctx.user_id, data)
    return await _planned_out(ctx, item.id)


@router.patch("/planned-purchases/{pid}", response_model=PlannedOut, tags=["planned"])
async def update_planned(pid: uuid.UUID, data: PlannedUpdate, ctx: CtxDep) -> PlannedOut:
    await planned.update_planned(ctx.db, ctx.user_id, pid, data)
    return await _planned_out(ctx, pid)


@router.delete("/planned-purchases/{pid}", status_code=204, tags=["planned"])
async def delete_planned(pid: uuid.UUID, ctx: CtxDep) -> Response:
    await planned.delete_planned(ctx.db, ctx.user_id, pid)
    return Response(status_code=204)


@router.post("/planned-purchases/{pid}/buy", response_model=PlannedOut, tags=["planned"])
async def buy_planned(pid: uuid.UUID, data: PlannedBuyIn, ctx: CtxDep) -> PlannedOut:
    await planned.buy_planned(ctx.db, ctx.user_id, pid, data, ctx.today)
    return await _planned_out(ctx, pid)
