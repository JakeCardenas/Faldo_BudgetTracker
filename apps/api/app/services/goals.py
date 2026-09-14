import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, NotFound
from app.engine.periods import add_months, month_end, month_start
from app.engine.planning import GoalProgress, goal_progress
from app.jobs.queue import enqueue_index, enqueue_unindex
from app.models import Account, GoalContribution, SavingsGoal
from app.models.enums import GoalStatus, TransactionSource, TransactionType
from app.schemas.ledger import TransactionIn
from app.schemas.planning import ContributionIn, ContributionOut, GoalIn, GoalOut, GoalUpdate
from app.services.accounts import account_balances
from app.services.common import apply_updates, get_owned
from app.services.transactions import create_transaction


async def _load(db: AsyncSession, user_id: uuid.UUID, goal_id: uuid.UUID) -> SavingsGoal:
    goal = (
        await db.execute(
            select(SavingsGoal)
            .where(SavingsGoal.id == goal_id, SavingsGoal.user_id == user_id)
            .options(selectinload(SavingsGoal.contributions))
        )
    ).scalar_one_or_none()
    if goal is None:
        raise NotFound("Goal not found.")
    return goal


async def compute_progress(
    db: AsyncSession, user_id: uuid.UUID, goal: SavingsGoal, today: date,
    balances: dict[uuid.UUID, int] | None = None, balances_3m: dict[uuid.UUID, int] | None = None,
) -> GoalProgress:
    window_start = add_months(month_start(today), -3)
    window_end = month_end(add_months(month_start(today), -1))
    if goal.linked_account_id:
        if balances is None:
            balances = {b.account.id: b.balance_minor for b in await account_balances(db, user_id)}
        if balances_3m is None:
            balances_3m = {b.account.id: b.balance_minor for b in await account_balances(db, user_id, window_start)}
        saved = max(0, balances.get(goal.linked_account_id, 0))
        growth = saved - balances_3m.get(goal.linked_account_id, 0)
        average = max(0, round(growth / 3))
    else:
        saved = sum(c.amount_minor for c in goal.contributions)
        created = goal.created_at.date()
        months = max(1, min(3, (today.year - created.year) * 12 + today.month - created.month))
        recent = sum(c.amount_minor for c in goal.contributions if window_start <= c.occurred_on <= window_end)
        if created > window_start:
            recent = sum(c.amount_minor for c in goal.contributions if c.occurred_on <= today)
        average = max(0, round(recent / months))
    return goal_progress(
        target_minor=goal.target_minor, saved_minor=saved, today=today, target_date=goal.target_date,
        planned_monthly_minor=goal.monthly_contribution_minor, average_monthly_minor=average,
    )


def to_out(goal: SavingsGoal, progress: GoalProgress, account_names: dict[uuid.UUID, str]) -> GoalOut:
    return GoalOut(
        id=goal.id, name=goal.name, emoji=goal.emoji, target_minor=goal.target_minor,
        saved_minor=progress.saved_minor, remaining_minor=progress.remaining_minor,
        pct_complete=progress.pct_complete, target_date=goal.target_date,
        monthly_contribution_minor=goal.monthly_contribution_minor,
        average_monthly_minor=progress.average_monthly_minor,
        required_monthly_minor=progress.required_monthly_minor, months_remaining=progress.months_remaining,
        projected_completion_on=progress.projected_completion_on, on_track=progress.on_track,
        status_reason=progress.status_reason, linked_account_id=goal.linked_account_id,
        linked_account_name=account_names.get(goal.linked_account_id) if goal.linked_account_id else None,
        status=goal.status, notes=goal.notes,
        contributions=[ContributionOut.model_validate(c) for c in sorted(goal.contributions, key=lambda c: c.occurred_on, reverse=True)],
        created_at=goal.created_at,
    )


async def list_goals(db: AsyncSession, user_id: uuid.UUID, today: date, include_archived: bool = False) -> list[GoalOut]:
    stmt = select(SavingsGoal).where(SavingsGoal.user_id == user_id).options(selectinload(SavingsGoal.contributions))
    if not include_archived:
        stmt = stmt.where(SavingsGoal.status != GoalStatus.archived)
    goals = (await db.execute(stmt.order_by(SavingsGoal.created_at))).scalars().all()
    all_balances = await account_balances(db, user_id)
    balances = {b.account.id: b.balance_minor for b in all_balances}
    names = {b.account.id: b.account.name for b in all_balances}
    balances_3m = {b.account.id: b.balance_minor for b in await account_balances(db, user_id, add_months(month_start(today), -3))}
    out = []
    for goal in goals:
        progress = await compute_progress(db, user_id, goal, today, balances, balances_3m)
        out.append(to_out(goal, progress, names))
    return out


async def get_goal_out(db: AsyncSession, user_id: uuid.UUID, goal_id: uuid.UUID, today: date) -> GoalOut:
    goal = await _load(db, user_id, goal_id)
    progress = await compute_progress(db, user_id, goal, today)
    names = {a.id: a.name for a in (await db.execute(select(Account).where(Account.user_id == user_id))).scalars()}
    return to_out(goal, progress, names)


async def create_goal(db: AsyncSession, user_id: uuid.UUID, currency: str, data: GoalIn, today: date) -> SavingsGoal:
    if data.linked_account_id:
        await get_owned(db, Account, data.linked_account_id, user_id, "Account")
    if data.target_date and data.target_date <= today:
        raise AppError("Choose a target date in the future.")
    goal = SavingsGoal(
        user_id=user_id, name=data.name, emoji=data.emoji, target_minor=data.target_minor, currency=currency,
        target_date=data.target_date, monthly_contribution_minor=data.monthly_contribution_minor,
        linked_account_id=data.linked_account_id, notes=data.notes,
    )
    db.add(goal)
    await db.flush()
    if data.initial_amount_minor and not data.linked_account_id:
        db.add(GoalContribution(user_id=user_id, goal_id=goal.id, amount_minor=data.initial_amount_minor,
                                occurred_on=today, note="Starting amount"))
    await db.flush()
    await enqueue_index(db, user_id, "goal", goal.id)
    return goal


async def update_goal(db: AsyncSession, user_id: uuid.UUID, goal_id: uuid.UUID, data: GoalUpdate) -> SavingsGoal:
    goal = await _load(db, user_id, goal_id)
    updates = data.model_dump(exclude_unset=True)
    if updates.get("linked_account_id"):
        await get_owned(db, Account, updates["linked_account_id"], user_id, "Account")
    apply_updates(goal, updates)
    await db.flush()
    await enqueue_index(db, user_id, "goal", goal.id)
    return goal


async def delete_goal(db: AsyncSession, user_id: uuid.UUID, goal_id: uuid.UUID) -> None:
    goal = await _load(db, user_id, goal_id)
    await db.delete(goal)
    await enqueue_unindex(db, user_id, "goal", goal_id)


async def add_contribution(
    db: AsyncSession, user_id: uuid.UUID, goal_id: uuid.UUID, data: ContributionIn, today: date
) -> GoalContribution:
    goal = await _load(db, user_id, goal_id)
    if data.amount_minor == 0:
        raise AppError("Enter an amount.")
    if data.occurred_on > today:
        raise AppError("Contributions cannot be dated in the future.")
    transaction_id = None
    if goal.linked_account_id:
        if not data.from_account_id:
            raise AppError("Choose the account the money comes from.")
        if data.amount_minor < 0:
            raise AppError("Withdraw from a linked savings account by recording a transfer.")
        txn = await create_transaction(
            db, user_id,
            TransactionIn(type=TransactionType.transfer, amount_minor=data.amount_minor, occurred_on=data.occurred_on,
                          account_id=data.from_account_id, to_account_id=goal.linked_account_id,
                          notes=data.note or f"Savings for {goal.name}"),
            TransactionSource.manual,
        )
        transaction_id = txn.id
    else:
        saved = sum(c.amount_minor for c in goal.contributions)
        if saved + data.amount_minor < 0:
            raise AppError("You cannot withdraw more than you have saved.")
    contribution = GoalContribution(user_id=user_id, amount_minor=data.amount_minor,
                                    occurred_on=data.occurred_on, note=data.note, transaction_id=transaction_id)
    goal.contributions.append(contribution)
    await db.flush()
    remaining = goal.target_minor - (saved + data.amount_minor) if not goal.linked_account_id else None
    if remaining is not None and remaining <= 0 and goal.status == GoalStatus.active:
        goal.status = GoalStatus.completed
    await enqueue_index(db, user_id, "goal", goal.id)
    return contribution


async def contributions_this_month(db: AsyncSession, user_id: uuid.UUID, today: date) -> dict[uuid.UUID, int]:
    rows = (
        await db.execute(
            select(GoalContribution.goal_id, func.sum(GoalContribution.amount_minor))
            .where(GoalContribution.user_id == user_id, GoalContribution.occurred_on >= month_start(today),
                   GoalContribution.occurred_on <= today)
            .group_by(GoalContribution.goal_id)
        )
    ).all()
    return {gid: int(total) for gid, total in rows}
