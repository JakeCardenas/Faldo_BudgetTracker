# Testing Patterns

**Analysis Date:** 2026-09-21

## Test Framework

**Backend runner:**
- pytest >=9.1 with pytest-asyncio >=1.4 (`apps/api/pyproject.toml`)
- Config: `[tool.pytest.ini_options]` in `apps/api/pyproject.toml`: `asyncio_mode = "auto"`, session-scoped loops for fixtures and tests, `testpaths = ["tests"]`.

**Assertion library:** plain `assert` (pytest); `pytest.raises` for errors.

**Frontend:** No test framework, no test files, no test script in `apps/web/package.json`. Frontend quality gates are ESLint, `tsc --noEmit` and `next build`.

**Run Commands:**
```bash
make test                          # cd apps/api && uv run pytest -q
cd apps/api && uv run pytest tests/test_money_plan.py -q   # single file
cd apps/api && uv run pytest -k safe_to_spend -q           # by name
make lint && make typecheck        # ruff, eslint, mypy, tsc
```
Coverage: no coverage tool configured.

## Test File Organization

**Location:** all backend tests are in `apps/api/tests/` (separate from source, flat, with `__init__.py` so helpers can be imported as `tests.conftest` / `tests.test_ai`).

**Naming:** `test_<topic>.py`, functions `test_<sentence_describing_behavior>` in `snake_case`, often long and behavioral (`test_plan_can_only_make_the_week_stricter`, `test_lending_and_repayment_move_money_without_counting_as_income_or_spending`).

**Structure:**
```
apps/api/tests/
├── conftest.py                       # env, engine, app, client fixtures
├── test_engine.py                    # pure engine unit tests (money, periods, budgets, goals, forecast)
├── test_safe_to_spend.py             # pure engine: safe-to-spend
├── test_money_plan.py                # pure engine + API integration for money plan
├── test_api.py                       # auth, CSRF, transactions, RLS isolation, budgets/goals/debts
├── test_money_owed.py                # debts/lending API flows
├── test_planned.py, test_check.py    # planned purchases, Faldo Check
├── test_income_and_forecast_inputs.py
├── test_engagement.py
├── test_capture_rules.py             # quick-capture parsing
├── test_ai.py, test_ai_guardrails.py # assistant, tools, RAG, numeric guardrails
└── test_platform.py                  # config, URL normalization, password reset, uploads
```

## Test Structure

Two styles coexist; choose by layer.

**Pure engine tests (sync, no DB):** call functions in `app/engine/*` directly with small helper builders and integer minor units.
```python
P = 100
WED = date(2026, 9, 23)  # a Wednesday

def bill(on: date, amount: float, label: str = "Bill", kind: str = "bill") -> KnownEvent:
    return KnownEvent(on, -round(amount * P), label, kind)

def test_cycle_ends_the_day_before_next_income():
    assert cycle_end(WED, WED + timedelta(days=10)) == (WED + timedelta(days=9), "until_income")
```
- Use fixed dates (not `today`) for engine tests so results are deterministic.
- Multiple related assertions per test are normal; tests are grouped by behavior, not one assert each.

**API integration tests (async, real Postgres, in-process ASGI):** use the `client` fixture (registered user) and hit `/api/v1/...` through `httpx.ASGITransport`.
```python
async def test_csrf_header_required(client):
    r = await client.post("/api/v1/accounts", json={"name": "X", "type": "cash"}, headers={"x-faldo-client": "other"})
    assert r.status_code == 403
```
- Async tests need no decorator (`asyncio_mode = "auto"`).
- Assert status codes with the response text for debuggability: `assert r.status_code == 201, r.text`.
- Per-file private helpers create prerequisite data through the API: `_account(client, ...)`, `_category(client, name)`, `_setup(client)` (see `tests/test_api.py`, `tests/test_money_owed.py`, `tests/test_money_plan.py`). Keep helpers prefixed `_` and annotate with `# type: ignore[no-untyped-def]` when untyped (mypy only checks `app`, ruff checks `tests`).
- Use `TODAY = today_in("Asia/Manila")` and `timedelta` offsets for date-relative data; test defaults use the `PHP` currency and `Asia/Manila` timezone.

## Fixtures (`apps/api/tests/conftest.py`)

- Module top sets env before importing app: `ENVIRONMENT=test`, `DATABASE_URL` (from `TEST_DATABASE_URL`, default `postgresql+asyncpg://faldo_app:faldo_app@localhost:5432/faldo_test`), `AI_PROVIDER=local`, `RECEIPT_STORAGE_DIR`.
- `engine_setup` (session, autouse): builds a `NullPool` async engine and injects it into `app.core.db` (`_engine`, `_sessionmaker`).
- `reset_limits` (autouse): `limiter.reset()` to clear rate limits between tests.
- `app` (session): `create_app()`.
- `anon`: unauthenticated `ApiClient`. `client` ("Alice") and `other_client` ("Bob"): registered users with unique random emails; use both to test tenant isolation.
- `ApiClient` subclass automatically adds the `x-faldo-client: web` header required by the CSRF check.
- `make_user(app, name)` is importable for tests that need extra users (`from tests.conftest import make_user`).
- `demo` fixture (module-scoped, in `tests/test_ai.py`): `seed(reset=True)` from `app.seed.demo`, logs in as the demo user. Reuse `ask(client, message)` from `tests/test_ai` to parse assistant SSE streams (`from tests.test_ai import ask`).
- Tests isolate by creating a fresh user per test rather than truncating tables; do not depend on empty tables.

## Mocking

**Framework:** pytest `monkeypatch`, hand-written fakes, and a context manager; no `unittest.mock` / mocking libraries.

**Patterns:**
```python
# Replace an outbound function (tests/test_platform.py)
monkeypatch.setattr(auth_module, "send_email", fake_send)

# Env-driven settings
monkeypatch.setenv("ALLOWED_ORIGINS", "https://faldo.vercel.app/, https://faldo.app")

# Temporary settings override (tests/test_platform.py)
with settings_override(some_flag=True):
    ...

# Scripted LLM provider implementing the provider protocol (tests/test_ai_guardrails.py)
class ScriptedProvider:
    name = "scripted"; is_development = False; supports_vision = False
    async def assistant_turn(self, *, system, transcript, tools) -> ModelTurn: ...
```

**What to mock:** outbound side effects (email sending), the LLM provider (use `ScriptedProvider` or the built-in `local` provider selected by `AI_PROVIDER=local`), and process settings.
**What NOT to mock:** the database, the FastAPI app, or services. Integration tests run against real Postgres with RLS, so tenant isolation is verified for real (see the `scoped_session` checks in `tests/test_api.py`).

## Fixtures and Factories

- No factory library. Test data is created through the public API in helpers, or by direct DB access with `scoped_session(user_id)` from `app.core.db` (pass `None` for the anonymous scope) when asserting on rows/RLS:
```python
async with scoped_session(uuid.UUID(other_me["id"])) as db:
    leaked = (await db.execute(select(Transaction).where(Transaction.user_id == uuid.UUID(me["id"])))).scalars().all()
    assert leaked == []
```
- Demo dataset: `app/seed/demo.py` (`seed`, `DEMO_EMAIL`).
- Scripted/inline data lives in each test file; there is no shared fixtures directory.

## Coverage

**Requirements:** None enforced (no coverage config, no threshold in CI).

## Test Types

**Unit tests:** pure engine logic (`test_engine.py`, `test_safe_to_spend.py`, top of `test_money_plan.py`), guardrails (`test_ai_guardrails.py`), config/URL normalization (`test_platform.py`). Fast, no DB.

**Integration tests:** the majority; full request path through routers -> services -> Postgres with real RLS. Requires Postgres with `pgvector`, `pg_trgm`, `citext` extensions and a non-superuser `faldo_app` role (no `BYPASSRLS`) migrated with `alembic upgrade head`. CI (`.github/workflows/ci.yml`) provisions `pgvector/pgvector:pg17`, creates the role, migrates as `faldo`, then runs pytest as `faldo_app`. Locally, `docker-compose.yml` provides the database; create a `faldo_test` database and migrate it before `make test`.

**E2E tests:** Not used. No browser/Playwright/Cypress setup.

**Frontend tests:** Not present. `apps/web/src/lib/format.ts` and `lib/calculator.ts` contain pure logic that would be the first candidates if a runner (Vitest) is added; place tests co-located as `*.test.ts` and add a `test` script in `apps/web/package.json` and a CI step.

## Common Patterns

**Async streaming (SSE) assertion (`tests/test_ai.py`):**
```python
r = await client.post("/api/v1/assistant/messages", json={"message": message})
assert r.status_code == 200, r.text
# split on "\n\n", parse "event: X" / "data: {...}" pairs into a dict
```

**Error testing:**
```python
with pytest.raises(ValueError):
    resolve_period("custom", today)

bad = await anon.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password-123"})
assert bad.status_code == 401 and "incorrect" in bad.json()["detail"]
```
Error bodies are `application/problem+json`; assert on `status_code` and `json()["detail"]` (validation: `json()["errors"]`).

**Money assertions:** compare integer minor units, expressed as `N * P` (`P = 100`) for readability: `assert a["needs_minor"] == 7_726 * P`.

**Adding a test for new work:**
1. Pure calculation added under `app/engine/`: add a sync test in `tests/test_engine.py` or a topic file, with fixed dates.
2. New endpoint or service: add an async test in the closest `tests/test_<topic>.py` using the `client` fixture; if it involves per-user data add an `other_client` isolation assertion.
3. New tool for the assistant: assert strict schema via `test_tool_schemas_are_strict` in `tests/test_ai.py` (all tool specs must have `additionalProperties: False` and every property required).
4. Run `make lint typecheck test` before committing; ruff lints `tests/` too (import sorting, unused variables).

---

*Testing analysis: 2026-09-21*
