import json
import logging
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Request, Response

from app.core.client_ip import client_ip
from app.core.errors import RateLimited
from app.core.rate_limit import limiter

router = APIRouter(include_in_schema=False)
logger = logging.getLogger("faldo.csp")

MAX_REPORT_BYTES = 16 * 1024


def _origin(value: Any) -> str:
    """Only where a blocked resource came from, never its full address (which could carry personal data)."""
    if not isinstance(value, str) or not value:
        return "-"
    if "://" not in value:
        return value[:40]  # "inline", "eval", "data" and the like
    parts = urlsplit(value)
    return f"{parts.scheme}://{parts.netloc}"[:120]


@router.post("/security/csp-report", status_code=204)
async def csp_report(request: Request) -> Response:
    """Where browsers report what the Content-Security-Policy (report-only for now) would have blocked. Browsers send
    these without the app's header, so the CSRF check skips this path; it only ever writes a short log line."""
    try:
        await limiter.hit(f"csp:{client_ip(request)}", 60, 3600)
    except RateLimited:
        return Response(status_code=204)
    body = await request.body()
    if len(body) > MAX_REPORT_BYTES:
        return Response(status_code=204)
    try:
        data = json.loads(body or b"{}")
    except ValueError:
        return Response(status_code=204)
    reports = data if isinstance(data, list) else [data]
    for item in reports[:10]:
        if not isinstance(item, dict):
            continue
        report = item.get("csp-report") or item.get("body") or {}
        if not isinstance(report, dict):
            continue
        directive = report.get("violated-directive") or report.get("effectiveDirective") or report.get("effective-directive")
        blocked = report.get("blocked-uri") or report.get("blockedURL")
        page = report.get("document-uri") or report.get("documentURL")
        logger.warning("CSP would block %s from %s on %s", str(directive)[:60], _origin(blocked),
                       urlsplit(page).path[:80] if isinstance(page, str) else "-")
    return Response(status_code=204)
