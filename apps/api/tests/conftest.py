import os
import uuid

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://faldo_app:faldo_app@localhost:5432/faldo_test")
os.environ["AI_PROVIDER"] = "local"
os.environ["RECEIPT_STORAGE_DIR"] = os.environ.get("TEST_RECEIPT_DIR", "/tmp/faldo-test-receipts")

import httpx
import pytest
from sqlalchemy.pool import NullPool

from app.core import db as db_module
from app.core.rate_limit import limiter


@pytest.fixture(scope="session", autouse=True)
async def engine_setup():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine(os.environ["DATABASE_URL"], poolclass=NullPool)
    db_module._engine = engine
    db_module._sessionmaker = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
def reset_limits():
    limiter.reset()


@pytest.fixture(scope="session")
def app():
    from app.main import create_app

    return create_app()


class ApiClient(httpx.AsyncClient):
    async def request(self, method, url, **kwargs):  # type: ignore[override]
        headers = kwargs.pop("headers", None) or {}
        headers.setdefault("x-faldo-client", "web")
        return await super().request(method, url, headers=headers, **kwargs)


@pytest.fixture
async def anon(app):
    async with ApiClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def make_user(app, name: str = "Tester") -> ApiClient:
    client = ApiClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    email = f"{name.lower()}-{uuid.uuid4().hex[:10]}@example.com"
    response = await client.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse-battery", "display_name": name})
    assert response.status_code == 201, response.text
    return client


@pytest.fixture
async def client(app):
    c = await make_user(app, "Alice")
    yield c
    await c.aclose()


@pytest.fixture
async def other_client(app):
    c = await make_user(app, "Bob")
    yield c
    await c.aclose()
