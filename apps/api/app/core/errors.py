import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.orm.exc import StaleDataError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("faldo.errors")


class AppError(Exception):
    status_code = 400
    title = "Bad request"
    # RFC 9457 "type": a URI a client can branch on. Plain errors are about:blank; the ones a client must tell apart
    # (a stale edit, a reused Idempotency-Key) name themselves.
    problem_type = "about:blank"

    def __init__(self, detail: str, *, status_code: int | None = None, errors: list[dict[str, Any]] | None = None,
                 extra: dict[str, Any] | None = None):
        super().__init__(detail)
        self.detail = detail
        if status_code is not None:
            self.status_code = status_code
        self.errors = errors or []
        # Extension members sent beside the standard ones, like the latest copy of what a stale edit was based on.
        self.extra = extra or {}


class NotFound(AppError):
    status_code = 404
    title = "Not found"


class Conflict(AppError):
    status_code = 409
    title = "Conflict"


class StaleRevision(Conflict):
    """An edit based on a version of a record that has changed since the client loaded it."""
    problem_type = "urn:faldo:problem:stale-revision"


class IdempotencyKeyReused(Conflict):
    """An Idempotency-Key already used for a different request."""
    problem_type = "urn:faldo:problem:idempotency-key-reused"


class Unauthorized(AppError):
    status_code = 401
    title = "Unauthorized"


class RateLimited(AppError):
    status_code = 429
    title = "Too many requests"


class ServiceUnavailable(AppError):
    status_code = 503
    title = "Service unavailable"


def _problem(status: int, title: str, detail: str, errors: list[dict[str, Any]] | None = None, *,
             problem_type: str = "about:blank", extra: dict[str, Any] | None = None) -> JSONResponse:
    body: dict[str, Any] = {**(extra or {}), "type": problem_type, "title": title, "status": status, "detail": detail}
    if errors:
        body["errors"] = errors
    return JSONResponse(body, status_code=status, media_type="application/problem+json")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return _problem(exc.status_code, exc.title, exc.detail, exc.errors, problem_type=exc.problem_type, extra=exc.extra)

    @app.exception_handler(StaleDataError)
    async def handle_stale_row(_: Request, exc: StaleDataError) -> JSONResponse:
        # A versioned row changed between being read and written by this request: another write won the race.
        logger.info("Stale write: %s", exc)
        return _problem(409, "Conflict", "This changed while you were working on it. Refresh and try again.",
                        problem_type=StaleRevision.problem_type)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"field": ".".join(str(p) for p in err["loc"] if p != "body"), "message": err["msg"]}
            for err in exc.errors()
        ]
        return _problem(422, "Validation failed", "Some fields are invalid.", errors)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _problem(exc.status_code, "Error", str(exc.detail))

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return _problem(500, "Internal server error", "Something went wrong. Please try again.")
