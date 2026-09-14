import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("faldo.errors")


class AppError(Exception):
    status_code = 400
    title = "Bad request"

    def __init__(self, detail: str, *, status_code: int | None = None, errors: list[dict[str, Any]] | None = None):
        super().__init__(detail)
        self.detail = detail
        if status_code is not None:
            self.status_code = status_code
        self.errors = errors or []


class NotFound(AppError):
    status_code = 404
    title = "Not found"


class Conflict(AppError):
    status_code = 409
    title = "Conflict"


class Unauthorized(AppError):
    status_code = 401
    title = "Unauthorized"


class RateLimited(AppError):
    status_code = 429
    title = "Too many requests"


class ServiceUnavailable(AppError):
    status_code = 503
    title = "Service unavailable"


def _problem(status: int, title: str, detail: str, errors: list[dict[str, Any]] | None = None) -> JSONResponse:
    body: dict[str, Any] = {"type": "about:blank", "title": title, "status": status, "detail": detail}
    if errors:
        body["errors"] = errors
    return JSONResponse(body, status_code=status, media_type="application/problem+json")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return _problem(exc.status_code, exc.title, exc.detail, exc.errors)

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
