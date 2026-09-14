import hmac

from fastapi import APIRouter, Request

from app.core.config import get_settings
from app.core.errors import Unauthorized
from app.jobs.worker import drain

router = APIRouter(include_in_schema=False)


@router.get("/internal/jobs/run")
async def run_jobs(request: Request) -> dict[str, int]:
    secret = get_settings().cron_secret
    provided = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if secret is None or not hmac.compare_digest(provided, secret.get_secret_value()):
        raise Unauthorized("Not allowed.")
    return {"processed": await drain(500)}
