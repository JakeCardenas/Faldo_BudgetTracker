import html
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Request, Response
from sqlalchemy import delete, select, update

from app.ai.factory import get_llm
from app.api.deps import AnonDbDep, CtxDep
from app.core.config import get_settings
from app.core.db import set_user_scope
from app.core.errors import AppError, Conflict, Unauthorized
from app.core.rate_limit import limiter
from app.core.security import hash_password, hash_token, new_session_token, verify_password
from app.models import (
    Account,
    AuthToken,
    Budget,
    Debt,
    FinancialNote,
    RecurringPayment,
    SavingsGoal,
    Session,
    User,
    UserSettings,
)
from app.schemas.auth import (
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    MeOut,
    RegisterIn,
    ResetPasswordIn,
    SessionOut,
    SettingsOut,
    SettingsUpdate,
)
from app.services.categories import create_default_categories
from app.services.email import send_email
from app.services.engagement import check_outfit
from app.services.transactions import TransactionFilters, list_transactions

router = APIRouter(tags=["auth"])


def _client_ip(request: Request) -> str:
    if get_settings().trust_proxy_headers:
        forwarded = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


async def _start_session(db: Any, response: Response, request: Request, user: User) -> None:
    settings = get_settings()
    token = new_session_token()
    db.add(Session(token_hash=hash_token(token), user_id=user.id,
                   expires_at=datetime.now(UTC) + timedelta(days=settings.session_ttl_days),
                   user_agent=(request.headers.get("user-agent") or "")[:255]))
    response.set_cookie(
        settings.session_cookie_name, token, max_age=settings.session_ttl_days * 86400, httponly=True,
        secure=settings.cookie_secure, samesite="lax", path="/",
    )


def _me(user: User, user_settings: UserSettings) -> MeOut:
    return MeOut(id=user.id, email=user.email, display_name=user.display_name,
                 settings=SettingsOut.model_validate(user_settings), ai_provider=get_llm().name)


@router.post("/auth/register", response_model=MeOut, status_code=201)
async def register(data: RegisterIn, request: Request, response: Response, db: AnonDbDep) -> MeOut:
    await limiter.hit(f"register:{_client_ip(request)}", 10, 3600)
    # Hash first so a taken email takes as long to answer as a new one.
    password_hash = hash_password(data.password)
    if await db.scalar(select(User.id).where(User.email == data.email)):
        raise Conflict("An account with this email already exists.")
    user = User(email=data.email, password_hash=password_hash, display_name=data.display_name)
    db.add(user)
    await db.flush()
    await set_user_scope(db, user.id)
    user_settings = UserSettings(user_id=user.id)
    db.add(user_settings)
    await create_default_categories(db, user.id)
    await _start_session(db, response, request, user)
    await db.flush()
    await db.refresh(user_settings)
    return _me(user, user_settings)


@router.post("/auth/login", response_model=MeOut)
async def login(data: LoginIn, request: Request, response: Response, db: AnonDbDep) -> MeOut:
    cfg = get_settings()
    await limiter.hit(f"login-ip:{_client_ip(request)}", cfg.login_attempts_per_15_min * 3, 900)
    await limiter.hit(f"login-email:{data.email.lower()}", cfg.login_attempts_per_15_min, 900)
    user = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if not verify_password(data.password, user.password_hash if user else None) or user is None:
        raise Unauthorized("Email or password is incorrect.")
    await set_user_scope(db, user.id)
    user_settings = await db.get(UserSettings, user.id)
    if user_settings is None:
        raise Unauthorized("Account is not fully set up.")
    await _start_session(db, response, request, user)
    return _me(user, user_settings)


@router.post("/auth/logout", status_code=204)
async def logout(ctx: CtxDep, response: Response) -> Response:
    await ctx.db.execute(delete(Session).where(Session.token_hash == ctx.session_token_hash))
    response.delete_cookie(get_settings().session_cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=MeOut)
async def me(ctx: CtxDep) -> MeOut:
    return _me(ctx.user, ctx.settings)


@router.patch("/me/settings", response_model=MeOut)
async def update_settings(data: SettingsUpdate, ctx: CtxDep) -> MeOut:
    updates = data.model_dump(exclude_unset=True)
    if "display_name" in updates:
        ctx.user.display_name = updates.pop("display_name")
    if "timezone" in updates:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(updates["timezone"])
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise AppError("Unknown timezone.") from exc
    if updates.get("default_account_id"):
        account = await ctx.db.scalar(select(Account.id).where(Account.id == updates["default_account_id"],
                                                                Account.user_id == ctx.user_id))
        if account is None:
            raise AppError("Account not found.")
    if "currency" in updates and updates["currency"] != ctx.settings.currency:
        has_accounts = await ctx.db.scalar(select(Account.id).where(Account.user_id == ctx.user_id).limit(1))
        if has_accounts:
            raise AppError("Currency can't be changed after accounts are created.")
    if "mascot_outfit" in updates:
        await check_outfit(ctx.db, ctx.user_id, ctx.settings, ctx.today, updates["mascot_outfit"])
    if "completed_lessons" in updates:
        updates["completed_lessons"] = list(dict.fromkeys(updates["completed_lessons"]))
    for key, value in updates.items():
        setattr(ctx.settings, key, value)
    await ctx.db.flush()
    return _me(ctx.user, ctx.settings)


@router.post("/me/onboarding/complete", response_model=MeOut)
async def complete_onboarding(ctx: CtxDep) -> MeOut:
    ctx.settings.onboarding_completed_at = datetime.now(UTC)
    await ctx.db.flush()
    return _me(ctx.user, ctx.settings)


@router.get("/me/export")
async def export_data(ctx: CtxDep) -> Response:
    listing = await list_transactions(ctx.db, ctx.user_id, TransactionFilters(), limit=100)
    all_items = list(listing.items)
    cursor = listing.next_cursor
    while cursor:
        page = await list_transactions(ctx.db, ctx.user_id, TransactionFilters(), limit=100, cursor=cursor)
        all_items.extend(page.items)
        cursor = page.next_cursor

    def rows(model: Any) -> Any:
        return select(model).where(model.user_id == ctx.user_id)

    def plain(obj: Any) -> dict[str, Any]:
        return {c.key: getattr(obj, c.key) for c in obj.__table__.columns if c.key not in {"user_id"}}

    payload = {
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": {"email": ctx.user.email, "display_name": ctx.user.display_name},
        "accounts": [plain(a) for a in (await ctx.db.execute(rows(Account))).scalars()],
        "transactions": [t.model_dump(mode="json") for t in all_items],
        "budgets": [plain(b) for b in (await ctx.db.execute(rows(Budget))).scalars()],
        "goals": [plain(g) for g in (await ctx.db.execute(rows(SavingsGoal))).scalars()],
        "recurring_payments": [plain(r) for r in (await ctx.db.execute(rows(RecurringPayment))).scalars()],
        "debts": [plain(d) for d in (await ctx.db.execute(rows(Debt))).scalars()],
        "notes": [plain(n) for n in (await ctx.db.execute(rows(FinancialNote))).scalars()],
    }
    return Response(
        json.dumps(payload, default=str, indent=2), media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="faldo-export.json"'},
    )


@router.delete("/me", status_code=204)
async def delete_account(ctx: CtxDep, response: Response) -> Response:
    from app.models import Receipt
    from app.storage.files import get_storage

    for receipt in (await ctx.db.execute(select(Receipt).where(Receipt.user_id == ctx.user_id))).scalars():
        if receipt.storage_key:
            await get_storage(ctx.db, ctx.user_id).delete(receipt.storage_key)
    await ctx.db.execute(delete(User).where(User.id == ctx.user_id))
    response.delete_cookie(get_settings().session_cookie_name, path="/")
    response.status_code = 204
    return response


RESET_PURPOSE = "password_reset"


@router.post("/auth/password/forgot", status_code=202)
async def forgot_password(data: ForgotPasswordIn, request: Request, db: AnonDbDep) -> dict[str, str]:
    cfg = get_settings()
    await limiter.hit(f"forgot-ip:{_client_ip(request)}", 10, 3600)
    await limiter.hit(f"forgot-email:{data.email.lower()}", 3, 3600)
    user = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if user is not None:
        token = new_session_token()
        db.add(AuthToken(token_hash=hash_token(token), user_id=user.id, purpose=RESET_PURPOSE,
                         expires_at=datetime.now(UTC) + timedelta(minutes=cfg.password_reset_ttl_minutes)))
        await db.flush()
        link = f"{cfg.public_app_url.rstrip('/')}/reset-password/{token}"
        minutes = cfg.password_reset_ttl_minutes
        await send_email(
            user.email,
            "Reset your Faldo password",
            f"Hi {user.display_name},\n\nUse this link to reset your Faldo password. It expires in {minutes} minutes:\n{link}\n\n"
            "If you didn't ask for this, you can ignore this email.",
            f"<p>Hi {html.escape(user.display_name)},</p><p>Use this link to reset your Faldo password. It expires in {minutes} "
            f"minutes.</p><p><a href=\"{html.escape(link)}\">Reset password</a></p>"
            "<p>If you didn't ask for this, you can ignore this email.</p>",
        )
    return {"detail": "If an account exists for that email, a reset link is on its way."}


@router.post("/auth/password/reset", response_model=MeOut)
async def reset_password(data: ResetPasswordIn, request: Request, response: Response, db: AnonDbDep) -> MeOut:
    await limiter.hit(f"reset-ip:{_client_ip(request)}", 20, 3600)
    now = datetime.now(UTC)
    token = (await db.execute(select(AuthToken).where(AuthToken.token_hash == hash_token(data.token),
                                                      AuthToken.purpose == RESET_PURPOSE))).scalar_one_or_none()
    if token is None or token.used_at is not None or token.expires_at < now:
        raise AppError("This reset link is invalid or has expired. Request a new one.")
    user = await db.get(User, token.user_id)
    if user is None:
        raise AppError("This reset link is invalid or has expired. Request a new one.")
    user.password_hash = hash_password(data.password)
    token.used_at = now
    await db.execute(update(Session).where(Session.user_id == user.id, Session.revoked_at.is_(None)).values(revoked_at=now))
    await db.execute(update(AuthToken).where(AuthToken.user_id == user.id, AuthToken.used_at.is_(None)).values(used_at=now))
    await set_user_scope(db, user.id)
    user_settings = await db.get(UserSettings, user.id)
    if user_settings is None:
        raise Unauthorized("Account is not fully set up.")
    await _start_session(db, response, request, user)
    return _me(user, user_settings)


@router.post("/me/password", status_code=204)
async def change_password(data: ChangePasswordIn, ctx: CtxDep) -> Response:
    await limiter.hit(f"change-password:{ctx.user_id}", 10, 3600)
    if not verify_password(data.current_password, ctx.user.password_hash):
        raise AppError("Your current password is incorrect.")
    ctx.user.password_hash = hash_password(data.new_password)
    await ctx.db.execute(
        update(Session).where(Session.user_id == ctx.user_id, Session.token_hash != ctx.session_token_hash,
                              Session.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC))
    )
    return Response(status_code=204)


@router.get("/auth/sessions", response_model=list[SessionOut])
async def list_sessions(ctx: CtxDep) -> list[SessionOut]:
    rows = (await ctx.db.execute(
        select(Session).where(Session.user_id == ctx.user_id, Session.revoked_at.is_(None), Session.expires_at > datetime.now(UTC))
        .order_by(Session.last_seen_at.desc())
    )).scalars().all()
    return [SessionOut(id=s.token_hash[:24], created_at=s.created_at, last_seen_at=s.last_seen_at, user_agent=s.user_agent,
                       current=s.token_hash == ctx.session_token_hash) for s in rows]


@router.delete("/auth/sessions/{session_id}", status_code=204)
async def revoke_session(session_id: str, ctx: CtxDep) -> Response:
    if len(session_id) != 24:
        raise AppError("Invalid session.")
    result = await ctx.db.execute(
        update(Session).where(Session.user_id == ctx.user_id, Session.token_hash.startswith(session_id, autoescape=True),
                              Session.token_hash != ctx.session_token_hash, Session.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    if not result.rowcount:  # type: ignore[attr-defined]
        raise AppError("Session not found or already signed out.", status_code=404)
    return Response(status_code=204)


@router.post("/auth/sessions/revoke-others", status_code=204)
async def revoke_other_sessions(ctx: CtxDep) -> Response:
    await ctx.db.execute(
        update(Session).where(Session.user_id == ctx.user_id, Session.token_hash != ctx.session_token_hash,
                              Session.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC))
    )
    return Response(status_code=204)
