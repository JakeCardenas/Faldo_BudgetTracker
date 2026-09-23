import hmac

from fastapi import APIRouter, Request

from app.core.config import get_settings
from app.core.errors import Unauthorized
from app.jobs.worker import drain

router = APIRouter(include_in_schema=False)


def _authorized(request: Request) -> None:
    secret = get_settings().cron_secret
    provided = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if secret is None or not hmac.compare_digest(provided, secret.get_secret_value()):
        raise Unauthorized("Not allowed.")


@router.get("/internal/checkins/run")
async def run_checkins(request: Request) -> dict[str, int]:
    """Once a day (Vercel cron): each subscribed user's most useful new check-in, as a phone notification."""
    _authorized(request)
    from app.services.push import send_daily_checkins

    return await send_daily_checkins()


@router.get("/internal/jobs/run")
async def run_jobs(request: Request) -> dict[str, int]:
    secret = get_settings().cron_secret
    provided = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if secret is None or not hmac.compare_digest(provided, secret.get_secret_value()):
        raise Unauthorized("Not allowed.")
    return {"processed": await drain(500)}
