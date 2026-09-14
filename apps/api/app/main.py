import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import RequestResponseEndpoint

from app.api.v1 import auth, intelligence, internal, ledger, planning
from app.core.config import get_settings
from app.core.db import dispose_engine
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging()
    stop = asyncio.Event()
    task = None
    if settings.job_mode == "worker" and settings.run_worker_in_api and settings.environment != "test":
        from app.jobs.worker import run_forever

        task = asyncio.create_task(run_forever(stop))
    yield
    stop.set()
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Faldo API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.environment != "production" else None,
        openapi_url="/api/openapi.json" if settings.environment != "production" else None,
    )
    install_error_handlers(app)

    @app.middleware("http")
    async def csrf_and_headers(request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in UNSAFE_METHODS and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and origin not in settings.allowed_origins:
                return JSONResponse({"title": "Forbidden", "status": 403, "detail": "Cross-origin request blocked."},
                                    status_code=403, media_type="application/problem+json")
            if request.headers.get("x-faldo-client") != "web":
                return JSONResponse({"title": "Forbidden", "status": 403, "detail": "Missing client header."},
                                    status_code=403, media_type="application/problem+json")
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/") and "cache-control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        return response

    for module in (auth, ledger, planning, intelligence, internal):
        app.include_router(module.router, prefix="/api/v1")

    @app.get("/api/health", include_in_schema=False)
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
