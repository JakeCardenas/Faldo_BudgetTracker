import html
import json
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Form, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, select, update

from app.ai import consent
from app.ai.factory import get_llm
from app.api.deps import AnonDbDep, CtxDep, require_recent_sign_in
from app.core.client_ip import client_ip
from app.core.config import get_settings
from app.core.db import set_user_scope
from app.core.errors import AppError, Conflict, Unauthorized
from app.core.rate_limit import limiter
from app.core.security import hash_password, hash_token, new_session_token, session_window, verify_password
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
    AIConsentIn,
    AIUseOut,
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    MeOut,
    PolicyAcceptIn,
    ReauthenticateIn,
    RegisterIn,
    ResetPasswordIn,
    SessionOut,
    SettingsOut,
    SettingsUpdate,
    VerifyEmailIn,
)
from app.services import demo, oauth
from app.services.categories import create_default_categories
from app.services.email import send_email
from app.services.engagement import check_outfit
from app.services.transactions import TransactionFilters, list_transactions

router = APIRouter(tags=["auth"])


async def _start_session(db: Any, response: Response, request: Request, user: User, *, remember: bool = True) -> None:
    settings = get_settings()
    token = new_session_token()
    now = datetime.now(UTC)
    expires_at = now + session_window(remember)
    if user.demo_expires_at is not None:
        expires_at = min(expires_at, user.demo_expires_at)
    db.add(Session(token_hash=hash_token(token), user_id=user.id, remember=remember, reauthenticated_at=now,
                   expires_at=expires_at,
                   user_agent=(request.headers.get("user-agent") or "")[:255]))
    # Not remembered: no max-age, so the browser drops the cookie when it closes.
    response.set_cookie(
        settings.session_cookie_name, token, max_age=settings.session_ttl_days * 86400 if remember else None,
        httponly=True, secure=settings.cookie_secure, samesite="lax", path="/",
    )


def _policy_to_accept(user: User) -> str | None:
    """The approved Privacy notice and Terms version this person hasn't agreed to yet, if there's one."""
    version = get_settings().policy_version
    return version if version and user.policy_version != version else None


def _me(user: User, user_settings: UserSettings) -> MeOut:
    llm = get_llm()
    return MeOut(id=user.id, email=user.email, display_name=user.display_name,
                 settings=SettingsOut.model_validate(user_settings),
                 ai_provider=llm.name if consent.permits(user_settings, llm) else "local",
                 ai=AIUseOut.model_validate(consent.summary(user_settings)),
                 email_verified=user.email_verified_at is not None, has_password=user.password_hash is not None,
                 is_demo=demo.is_demo(user), demo_expires_at=user.demo_expires_at,
                 policy_to_accept=_policy_to_accept(user))


VERIFY_PURPOSE = "verify_email"


async def _send_verification(db: Any, user: User) -> None:
    """Email a link that confirms this account owns its address. Opening it only counts while signed in to the same
    account, so someone who registered another person's email can't get it confirmed by that person clicking it."""
    cfg = get_settings()
    now = datetime.now(UTC)
    await db.execute(update(AuthToken).where(AuthToken.user_id == user.id, AuthToken.purpose == VERIFY_PURPOSE,
                                             AuthToken.used_at.is_(None)).values(used_at=now))
    token = new_session_token()
    db.add(AuthToken(token_hash=hash_token(token), user_id=user.id, purpose=VERIFY_PURPOSE,
                     expires_at=now + timedelta(hours=cfg.email_verification_ttl_hours)))
    await db.flush()
    link = f"{cfg.public_app_url.rstrip('/')}/verify-email/{token}"
    await send_email(
        user.email,
        "Confirm your email for Faldo",
        f"Hi {user.display_name},\n\nConfirm this is your email by opening this link while signed in to Faldo:\n{link}\n\n"
        "If you didn't sign up for Faldo, ignore this email: without the password, nobody can confirm it.",
        f"<p>Hi {html.escape(user.display_name)},</p><p>Confirm this is your email by opening this link while signed in "
        f"to Faldo.</p><p><a href=\"{html.escape(link)}\">Confirm email</a></p>"
        "<p>If you didn't sign up for Faldo, ignore this email: without the password, nobody can confirm it.</p>",
    )


def _with_notice(path: str, notice: str) -> str:
    """The same in-app path with a notice for the app to show once (it removes the parameter after)."""
    parts = urlsplit(path)
    query = [*parse_qsl(parts.query, keep_blank_values=True), ("notice", notice)]
    return urlunsplit(("", "", parts.path or "/", urlencode(query), parts.fragment))


@router.post("/auth/register", response_model=MeOut, status_code=201)
async def register(data: RegisterIn, request: Request, response: Response, db: AnonDbDep) -> MeOut:
    await limiter.hit(f"register:{client_ip(request)}", 10, 3600)
    # Only an approved version is recorded, and only when the person ticked to agree to that exact version. While the
    # documents are drafts (no POLICY_VERSION), nothing is recorded either way.
    policy = get_settings().policy_version
    if policy and data.accepted_policy_version != policy:
        raise AppError("To create an account, agree to the Terms of use and the Privacy notice.")
    # Hash first so a taken email takes as long to answer as a new one.
    password_hash = hash_password(data.password)
    if await db.scalar(select(User.id).where(User.email == data.email)):
        raise Conflict("An account with this email already exists.")
    user = User(email=data.email, password_hash=password_hash, display_name=data.display_name,
                policy_version=policy, policy_accepted_at=datetime.now(UTC) if policy else None)
    db.add(user)
    await db.flush()
    await set_user_scope(db, user.id)
    user_settings = UserSettings(user_id=user.id)
    db.add(user_settings)
    await create_default_categories(db, user.id)
    await _start_session(db, response, request, user)
    await _send_verification(db, user)
    await db.flush()
    await db.refresh(user_settings)
    return _me(user, user_settings)


@router.post("/auth/demo", response_model=MeOut, status_code=201)
async def start_demo(request: Request, response: Response, db: AnonDbDep) -> MeOut:
    """Try Faldo without signing up: a sandbox account of this visitor's own, with sample data, for a day."""
    if not get_settings().demo_enabled:
        raise AppError("The demo isn't available here.", status_code=404)
    await limiter.hit(f"demo:{client_ip(request)}", get_settings().demo_starts_per_ip_per_hour, 3600)
    user = await demo.create(db)
    await _start_session(db, response, request, user, remember=False)
    await db.flush()
    user_settings = await db.get(UserSettings, user.id)
    if user_settings is None:
        raise Unauthorized("Account is not fully set up.")
    return _me(user, user_settings)


@router.post("/auth/login", response_model=MeOut)
async def login(data: LoginIn, request: Request, response: Response, db: AnonDbDep) -> MeOut:
    cfg = get_settings()
    await limiter.hit(f"login-ip:{client_ip(request)}", cfg.login_attempts_per_15_min * 3, 900)
    await limiter.hit(f"login-email:{data.email.lower()}", cfg.login_attempts_per_15_min, 900)
    user = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if not verify_password(data.password, user.password_hash if user else None) or user is None:
        raise Unauthorized("Email or password is incorrect.")
    await set_user_scope(db, user.id)
    user_settings = await db.get(UserSettings, user.id)
    if user_settings is None:
        raise Unauthorized("Account is not fully set up.")
    await _start_session(db, response, request, user, remember=data.remember)
    return _me(user, user_settings)


@router.get("/auth/providers", tags=["auth"])
async def sign_in_providers() -> dict[str, bool]:
    """Which "Continue with…" buttons to show: only the services this server is set up for, and whether the demo is on."""
    return {**{provider: oauth.enabled(provider) for provider in oauth.PROVIDERS}, "demo": get_settings().demo_enabled}


@router.get("/auth/policy", tags=["auth"])
async def current_policy() -> dict[str, str | None]:
    """The approved Privacy notice and Terms version people agree to when signing up. None while they're drafts."""
    return {"version": get_settings().policy_version}


@router.get("/auth/{provider}/start", tags=["auth"])
async def oauth_start(provider: str, request: Request, next_path: Annotated[str, Query(alias="next")] = "/") -> Response:
    if provider not in oauth.PROVIDERS or not oauth.enabled(provider):
        return RedirectResponse("/login?error=unavailable", status_code=302)
    await limiter.hit(f"oauth:{client_ip(request)}", 30, 900)
    state, cookie = oauth.new_state(provider, next_path)
    response = RedirectResponse(oauth.authorize_url(provider, state, oauth.get_settings()), status_code=302)
    secure = get_settings().cookie_secure
    # Apple comes back by a cross-site POST, which only carries SameSite=None cookies (and those must be Secure).
    response.set_cookie(oauth.STATE_COOKIE, cookie, max_age=oauth.STATE_SECONDS, httponly=True, secure=secure,
                        samesite="none" if provider == "apple" and secure else "lax", path="/api/v1/auth")
    return response


async def _finish_oauth(provider: str, request: Request, db: Any, code: str | None, state: str | None, error: str | None,
                        identity: Callable[[str], Awaitable[oauth.Identity]]) -> Response:
    """Back from Google or Apple: check the state, learn who it is, sign them in and go where they were going."""
    try:
        next_path = oauth.check_state(provider, state, request.cookies.get(oauth.STATE_COOKIE))
        if error:
            raise oauth.SignInError("cancelled" if error in {"access_denied", "user_cancelled_authorize"} else provider)
        if not code:
            raise oauth.SignInError(provider)
        signed_in = await oauth.sign_in(db, await identity(code))
    except oauth.SignInError as exc:
        response: Response = RedirectResponse(f"/login?error={exc.code}", status_code=302)
    else:
        target = _with_notice(next_path, "account-secured") if signed_in.secured else next_path
        response = RedirectResponse(target, status_code=302)
        await _start_session(db, response, request, signed_in.user)
    response.delete_cookie(oauth.STATE_COOKIE, path="/api/v1/auth")
    return response


@router.get("/auth/google/callback", tags=["auth"])
async def google_callback(request: Request, db: AnonDbDep, code: str | None = None, state: str | None = None,
                          error: str | None = None) -> Response:
    return await _finish_oauth("google", request, db, code, state, error, oauth.google_identity)


@router.post("/auth/apple/callback", tags=["auth"])
async def apple_callback(request: Request, db: AnonDbDep, code: Annotated[str | None, Form()] = None,
                         state: Annotated[str | None, Form()] = None, error: Annotated[str | None, Form()] = None,
                         user: Annotated[str | None, Form()] = None) -> Response:
    return await _finish_oauth("apple", request, db, code, state, error, lambda c: oauth.apple_identity(c, user))


@router.post("/auth/logout", status_code=204)
async def logout(ctx: CtxDep, response: Response) -> Response:
    await ctx.db.execute(delete(Session).where(Session.token_hash == ctx.session_token_hash))
    # A demo sandbox has no way back in once its session ends, so it goes now rather than at its end time.
    await demo.end(ctx.db, ctx.user)
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


@router.put("/me/ai-consent", response_model=MeOut)
async def set_ai_consent(data: AIConsentIn, ctx: CtxDep) -> MeOut:
    """The person's choice about sending their data to the outside AI services configured right now."""
    ctx.settings.ai_consent = data.choice
    ctx.settings.ai_consent_at = datetime.now(UTC)
    ctx.settings.ai_consent_providers = consent.external_providers() if data.choice == "allowed" else []
    await ctx.db.flush()
    return _me(ctx.user, ctx.settings)


@router.post("/me/policy", response_model=MeOut)
async def accept_policy(data: PolicyAcceptIn, ctx: CtxDep) -> MeOut:
    """Record that this person agreed to the approved Privacy notice and Terms, the exact version they were shown."""
    version = get_settings().policy_version
    if not version:
        raise AppError("There's no approved version of the Privacy notice and Terms to agree to yet.", status_code=409)
    if data.version != version:
        raise AppError("The Privacy notice or Terms changed. Reload the page to see the current version.", status_code=409)
    ctx.user.policy_version = version
    ctx.user.policy_accepted_at = datetime.now(UTC)
    await ctx.db.flush()
    return _me(ctx.user, ctx.settings)


@router.get("/ai/providers")
async def ai_providers() -> dict[str, Any]:
    """For the Privacy page, signed in or not: which outside AI services this Faldo uses and what they say they do
    with data. Names only, never keys."""
    return {"providers": consent.describe(), "sends": consent.WHAT_IS_SENT}


@router.post("/me/onboarding/complete", response_model=MeOut)
async def complete_onboarding(ctx: CtxDep) -> MeOut:
    ctx.settings.onboarding_completed_at = datetime.now(UTC)
    await ctx.db.flush()
    return _me(ctx.user, ctx.settings)


@router.get("/me/export")
async def export_data(ctx: CtxDep) -> Response:
    await require_recent_sign_in(ctx)
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
    await require_recent_sign_in(ctx)
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
    await limiter.hit(f"forgot-ip:{client_ip(request)}", 10, 3600)
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
    await limiter.hit(f"reset-ip:{client_ip(request)}", 20, 3600)
    now = datetime.now(UTC)
    token = (await db.execute(select(AuthToken).where(AuthToken.token_hash == hash_token(data.token),
                                                      AuthToken.purpose == RESET_PURPOSE))).scalar_one_or_none()
    if token is None or token.used_at is not None or token.expires_at < now:
        raise AppError("This reset link is invalid or has expired. Request a new one.")
    user = await db.get(User, token.user_id)
    if user is None:
        raise AppError("This reset link is invalid or has expired. Request a new one.")
    user.password_hash = hash_password(data.password)
    # The link arrived in this inbox, so whoever used it owns the email; everything else is signed out below.
    user.email_verified_at = user.email_verified_at or now
    token.used_at = now
    await db.execute(update(Session).where(Session.user_id == user.id, Session.revoked_at.is_(None)).values(revoked_at=now))
    await db.execute(update(AuthToken).where(AuthToken.user_id == user.id, AuthToken.used_at.is_(None)).values(used_at=now))
    await set_user_scope(db, user.id)
    user_settings = await db.get(UserSettings, user.id)
    if user_settings is None:
        raise Unauthorized("Account is not fully set up.")
    await _start_session(db, response, request, user)
    return _me(user, user_settings)


@router.post("/auth/email/verify", response_model=MeOut)
async def verify_email(data: VerifyEmailIn, ctx: CtxDep) -> MeOut:
    """Confirm the signed-in account owns its email. The link must have been sent to this same account."""
    await limiter.hit(f"verify-email:{ctx.user_id}", 20, 3600)
    now = datetime.now(UTC)
    token = (await ctx.db.execute(select(AuthToken).where(AuthToken.token_hash == hash_token(data.token),
                                                          AuthToken.purpose == VERIFY_PURPOSE))).scalar_one_or_none()
    if ctx.user.email_verified_at is not None and (token is None or token.user_id == ctx.user_id):
        return _me(ctx.user, ctx.settings)
    if token is None or token.user_id != ctx.user_id or token.used_at is not None or token.expires_at < now:
        raise AppError("This link is invalid, has expired, or is for a different account. Send a new one from Settings.")
    token.used_at = now
    ctx.user.email_verified_at = now
    await ctx.db.flush()
    return _me(ctx.user, ctx.settings)


@router.post("/auth/email/resend", status_code=204)
async def resend_verification(ctx: CtxDep) -> Response:
    demo.refuse_in_demo(ctx.user, "Email")
    if ctx.user.email_verified_at is None:
        await limiter.hit(f"verify-resend:{ctx.user_id}", 3, 3600)
        await _send_verification(ctx.db, ctx.user)
    return Response(status_code=204)


@router.post("/auth/reauthenticate", status_code=204)
async def reauthenticate(data: ReauthenticateIn, ctx: CtxDep) -> Response:
    """Re-enter the password to confirm it's you before a sensitive action. Accounts without a password confirm by
    signing in with Google or Apple again, which starts a fresh session."""
    await limiter.hit(f"reauth:{ctx.user_id}", 10, 900)
    if ctx.user.password_hash is None:
        raise AppError("Your account signs in with Google or Apple. Sign in with it again to confirm it's you.")
    if not verify_password(data.password, ctx.user.password_hash):
        raise AppError("That password is incorrect.")
    await ctx.db.execute(update(Session).where(Session.token_hash == ctx.session_token_hash)
                         .values(reauthenticated_at=datetime.now(UTC)))
    return Response(status_code=204)


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
