<!-- refreshed: 2026-09-21 -->
# Architecture

**Analysis Date:** 2026-09-21

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│  apps/web  (Next.js 16 App Router, React 19, TanStack Query)         │
├──────────────────┬───────────────────────┬──────────────────────────┤
│ Route pages      │ Feature components    │ Data layer               │
│ `src/app/(app)`  │ `src/components/*`    │ `src/lib/api.ts`,        │
│ `src/app/(auth)` │ AppShell + sheets     │ `src/lib/queries.ts`     │
└────────┬─────────┴───────────┬───────────┴────────────┬─────────────┘
         │  same-origin `/api/*` rewrite (`next.config.ts`), cookie    │
         │  `faldo_session` + header `x-faldo-client: web`             │
         ▼                                                              
┌─────────────────────────────────────────────────────────────────────┐
│  apps/api  (FastAPI, async)                                          │
│  HTTP layer  `app/api/v1/*.py` + `app/api/deps.py` (Ctx)             │
├─────────────────────────────────────────────────────────────────────┤
│  Services    `app/services/*.py`  (DB access + orchestration)        │
│      │                       │                                       │
│      ▼                       ▼                                       │
│  Engine (pure math)     AI layer `app/ai/*`                          │
│  `app/engine/*.py`      tools -> services -> engine                  │
│                         providers / rag / guardrails / capture       │
├─────────────────────────────────────────────────────────────────────┤
│  Jobs `app/jobs/*` (Postgres queue)   Storage `app/storage/files.py` │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PostgreSQL 17 + pgvector + pg_trgm, row-level security per user    │
│  models `app/models/*.py`, migrations `apps/api/migrations/versions`│
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App factory | Middleware (CSRF/Origin/security headers), router mounting, worker lifespan | `apps/api/app/main.py` |
| Request context | Cookie session lookup, RLS scoping, `Ctx` dataclass, inline job drain | `apps/api/app/api/deps.py` |
| Routers | Thin HTTP handlers grouped by domain (`auth`, `ledger`, `planning`, `intelligence`, `engagement`, `internal`) | `apps/api/app/api/v1/` |
| Services | Domain logic + SQLAlchemy queries, shared by REST and AI tools | `apps/api/app/services/` |
| Engine | Pure deterministic finance math (no DB, no I/O) | `apps/api/app/engine/` |
| Models | SQLAlchemy 2 ORM tables, enums | `apps/api/app/models/` |
| Schemas | Pydantic v2 request/response models | `apps/api/app/schemas/` |
| AI tools | Strict-schema tool registry + 21 financial tools | `apps/api/app/ai/tools/registry.py`, `apps/api/app/ai/tools/definitions.py` |
| Assistant | Tool loop, SSE streaming, citations, numeric verification | `apps/api/app/ai/assistant/service.py` |
| Providers | LLM/embedding protocol; OpenAI and local dev implementations | `apps/api/app/ai/providers/`, `apps/api/app/ai/factory.py` |
| RAG | Document rendering, indexing, hybrid (vector + trigram, RRF) retrieval | `apps/api/app/ai/rag/` |
| Capture | Natural-language transaction parsing (rules first, LLM fallback) | `apps/api/app/ai/capture/` |
| Guardrails | Numeric faithfulness check, output sanitizing | `apps/api/app/ai/guardrails/` |
| Job queue | `jobs` table, `FOR UPDATE SKIP LOCKED` claim, retry with backoff | `apps/api/app/jobs/queue.py`, `apps/api/app/jobs/worker.py` |
| Web shell | Nav, add-transaction sheet, Faldo Check, search, more sheet, action context | `apps/web/src/components/layout/app-shell.tsx`, `apps/web/src/components/layout/app-context.tsx` |
| Web data layer | Fetch wrapper + typed TanStack Query hooks and cache keys | `apps/web/src/lib/api.ts`, `apps/web/src/lib/queries.ts`, `apps/web/src/lib/types.ts` |
| Route guard | Redirect to `/login` when session cookie is absent | `apps/web/src/proxy.ts` |

## Pattern Overview

**Overall:** Monorepo with a decoupled SPA-style Next.js client and a layered (router -> service -> engine) async FastAPI backend. "Deterministic engine calculates, RAG retrieves, LLM only explains."

**Key Characteristics:**
- The backend owns all persistence and business rules; the frontend never touches the database.
- Money is integer minor units everywhere (`*_minor` columns/fields); currency formatting is done in `apps/web/src/lib/format.ts` and `apps/api/app/engine/money.py`.
- `app/engine/*` has no SQLAlchemy or model imports: it takes plain dataclasses (e.g. `CheckInputs` in `app/engine/check.py`, `PlanInputs` in `app/engine/money_plan.py`) and returns plain data. Services gather DB facts, build the inputs, call the engine.
- Multi-tenancy is enforced twice: every service query filters `user_id`, and Postgres RLS policies (`<table>_owner`, created in `apps/api/migrations/versions/0001_initial_schema.py`) key off `current_setting('app.user_id')`, set per transaction by `set_user_scope` in `apps/api/app/core/db.py`.
- AI features never invent numbers: tools return calculated results, `app/ai/guardrails/numeric.py` verifies each figure in the answer against tool output and triggers a repair prompt.

## Layers

**HTTP (routers):**
- Purpose: Validate input with Pydantic, call one or more service functions, return dict/schema.
- Location: `apps/api/app/api/v1/`
- Contains: `APIRouter` modules, all mounted under `/api/v1` in `app/main.py`.
- Depends on: `app/api/deps.py` (`CtxDep`, `AnonDbDep`), `app/services`, `app/schemas`, `app/core`.
- Used by: The web app and the Vercel cron (`/api/v1/internal/jobs/run`).

**Services:**
- Purpose: Domain orchestration and all DB queries. Signature convention: `async def fn(db, user_id, settings, today, ...)`; functions receive `today` from `Ctx.today` (timezone-aware) rather than calling the clock.
- Location: `apps/api/app/services/`
- Depends on: `app/models`, `app/engine`, `app/core/errors`, `app/services/common.py` (`get_owned`, `apply_updates`).
- Used by: routers and `app/ai/tools/definitions.py`.

**Engine:**
- Purpose: Safe to Spend, forecast (Monte Carlo), scenarios, budgets/goals math, health score, anomalies, calculator, Faldo Check, Money Plan allocation.
- Location: `apps/api/app/engine/` (`safe_to_spend.py`, `forecast.py`, `scenarios.py`, `planning.py`, `check.py`, `money_plan.py`, `health.py`, `analysis.py`, `calculator.py`, `money.py`, `periods.py`)
- Depends on: stdlib/Decimal only (plus other engine modules).
- Used by: services, AI tools.

**Persistence:**
- Purpose: ORM models and schema history.
- Location: `apps/api/app/models/` (`identity.py`, `ledger.py`, `planning.py`, `ai.py`, `enums.py`, `base.py`); migrations in `apps/api/migrations/versions/0001`..`0007`.
- Mixins in `app/models/base.py`: `UUIDPk`, `Timestamps`, `UserOwned`; constraint naming convention set on `Base.metadata`. Enums are non-native string enums via `str_enum`.

**AI layer:**
- Purpose: Assistant, capture, receipts, RAG.
- Location: `apps/api/app/ai/`
- Depends on: services and engine (through tools), `app/core/db.scoped_session`.

**Frontend pages:**
- Location: `apps/web/src/app/(app)/*/page.tsx` (authenticated, wrapped by `AppShell`), `apps/web/src/app/(auth)/*` (login, register, password reset), `apps/web/src/app/onboarding/page.tsx`.

## Data Flow

### Primary Request Path (authenticated REST call)

1. A page component calls a hook from `apps/web/src/lib/queries.ts` (e.g. `useMoneyPlan`), which calls `api.get("/money-plan")` in `apps/web/src/lib/api.ts` (adds `x-faldo-client: web`, `credentials: same-origin`).
2. `next.config.ts` rewrites `/api/:path*` to `API_ORIGIN`; the httpOnly `faldo_session` cookie travels with it.
3. `csrf_and_headers` middleware in `apps/api/app/main.py` enforces the Origin allow-list and the client header on POST/PUT/PATCH/DELETE, and sets `Cache-Control: no-store`.
4. The router handler (e.g. `get_money_plan` in `apps/api/app/api/v1/planning.py`) depends on `CtxDep`; `get_ctx` in `app/api/deps.py` hashes the cookie token, loads `Session`+`User`, opens a transaction, calls `set_user_scope` (RLS), and yields `Ctx(db, user, settings, ...)`.
5. Handler calls a service (`app/services/money_plan.py`), which queries via `ctx.db`, builds engine inputs, calls `app/engine/money_plan.py`, returns a dict.
6. After the request, in `job_mode == "inline"` (serverless), `get_ctx` drains queued jobs for that user for unsafe methods.

### Assistant Streaming Flow

1. `POST /api/v1/assistant/messages` (`apps/api/app/api/v1/intelligence.py`) rate-limits, then returns a `StreamingResponse` of SSE events from `stream_answer` in `app/ai/assistant/service.py`.
2. `stream_answer` opens its own `scoped_session(user_id)` and loops up to `MAX_ROUNDS` (6): `get_llm().assistant_turn(...)` -> tool calls dispatched by `run_tool` in `app/ai/tools/registry.py` -> handlers in `app/ai/tools/definitions.py` call services/engine/retriever.
3. Tool outputs carry `blocks` (calculation cards) and `refs` (`t`, `i`, `m` citations) via `ToolContext.add_ref`.
4. The final text is checked by `check_numbers` (`app/ai/guardrails/numeric.py`); unsupported figures trigger `REPAIR_PROMPT`; output goes through `app/ai/guardrails/output.py` (sanitize, strip unknown refs, add advice note).
5. Messages are persisted in `AIConversation`/`AIMessage` (`app/models/ai.py`).

### Background Indexing / Receipt Flow

1. Services enqueue jobs with `enqueue_index`, `enqueue_unindex`, `enqueue_monthly_summary` (`app/jobs/queue.py`) inside the same transaction as the write.
2. Workers (`python -m app.worker`, `run_forever` in the API lifespan when `job_mode == "worker"`, `drain` inline, or the cron route) claim rows with `FOR UPDATE SKIP LOCKED` (`_claim` in `app/jobs/worker.py`).
3. `handle` dispatches by `job.kind`: `index_entity`, `unindex_entity`, `index_monthly_summary` (`app/ai/rag/indexer.py`), `extract_receipt` (`app/services/receipts.py`). Failures retry with exponential backoff up to `MAX_ATTEMPTS = 4`.

**State Management:**
- Server: Postgres is the only state; sessions are rows in `sessions` (token hash stored, not the token).
- Client: TanStack Query cache (staleTime 30s, `retry` skips 4xx) with centralized `keys` in `apps/web/src/lib/queries.ts`; UI-level actions (open add sheet, Faldo Check, search) via `AppActionsContext` in `apps/web/src/components/layout/app-context.tsx`. Theme via `next-themes`.

## Key Abstractions

**`Ctx` / `CtxDep`:**
- Purpose: Per-request authenticated context (DB session already RLS-scoped, user, settings, `today`, `currency`).
- Examples: `apps/api/app/api/deps.py`
- Pattern: FastAPI dependency yielding inside a single transaction.

**Tool registry (`@tool`):**
- Purpose: Register an AI tool with Pydantic args model, handler `(ToolContext, args) -> ToolOutput`, and status label; specs are generated with `$ref`s inlined for strict function schemas.
- Examples: `apps/api/app/ai/tools/registry.py`, `apps/api/app/ai/tools/definitions.py`
- Pattern: Decorator-populated module-level `TOOLS` dict.

**Provider protocols:**
- Purpose: `LLMProvider` / `EmbeddingProvider` Protocols decouple the assistant from OpenAI; `get_llm()` / `get_embeddings()` in `app/ai/factory.py` pick OpenAI or `LocalDevelopmentProvider` / `LocalHashEmbeddings` by `settings.resolved_ai_provider`.
- Examples: `apps/api/app/ai/providers/base.py`, `apps/api/app/ai/providers/openai_provider.py`, `apps/api/app/ai/providers/local_provider.py`

**Engine input dataclasses:**
- Purpose: Frozen dataclasses (`CheckInputs`, `PlanInputs`, `PlanWeek`) passed to pure functions.
- Examples: `apps/api/app/engine/check.py`, `apps/api/app/engine/money_plan.py`, `apps/api/app/engine/safe_to_spend.py`

**Domain errors:**
- Purpose: `AppError` subclasses (`NotFound`, `Conflict`, `Unauthorized`, `RateLimited`) mapped to RFC 7807-style `application/problem+json` by `install_error_handlers`.
- Examples: `apps/api/app/core/errors.py`

**`ObjectStorage` protocol:**
- Purpose: Receipt image storage; `LocalStorage` on disk, DB-backed `StoredFile` for serverless.
- Examples: `apps/api/app/storage/files.py`, `apps/api/app/models/ai.py`

## Entry Points

**API app:**
- Location: `apps/api/app/main.py` (`app = create_app()`)
- Triggers: `uvicorn app.main:app` (`make api`), Docker `api` service, Vercel.
- Responsibilities: middleware, error handlers, router registration, health at `/api/health`, optional in-process worker.

**Worker:**
- Location: `apps/api/app/worker.py`
- Triggers: `python -m app.worker` (`make worker`, compose `worker` service).

**Cron job runner:**
- Location: `apps/api/app/api/v1/internal.py` (`GET /api/v1/internal/jobs/run`, bearer `cron_secret`), scheduled in `apps/api/vercel.json`.

**Migrations / seed:**
- `apps/api/migrations/` (Alembic, `alembic.ini`), `apps/api/app/deploy.py` (migrate on build), `apps/api/app/seed/demo.py` (Philippine demo dataset).

**Web root:**
- Location: `apps/web/src/app/layout.tsx` (fonts, `Splash`, `Providers`), `apps/web/src/app/providers.tsx`, `apps/web/src/app/(app)/layout.tsx` (`AppShell`), `apps/web/src/proxy.ts` (session-cookie redirect).

## Architectural Constraints

- **Threading:** Single asyncio event loop per API process; all DB access is async (`asyncpg`). The optional in-process worker is an `asyncio` task created in `lifespan`, skipped when `environment == "test"`.
- **Global state:** Module-level lazy singletons: `_engine`/`_sessionmaker` in `apps/api/app/core/db.py` (tests override them in `apps/api/tests/conftest.py`); `TOOLS` in `app/ai/tools/registry.py`; `lru_cache` on `get_settings`, `get_llm`, `get_embeddings`; `limiter` in `app/core/rate_limit.py` (Postgres-backed `RateLimitHit`).
- **Serverless mode:** On Vercel `db_pool` defaults to `null` (`NullPool`) and `job_mode` runs inline; `db_pgbouncer` disables asyncpg prepared statement cache (`app/core/db.py`, `app/core/config.py`).
- **Circular imports:** Not detected. Late imports are used deliberately in `app/main.py` and `app/api/deps.py` for `app.jobs.worker` and in `app/jobs/worker.py` for `app.services.receipts`.
- **Tool registration by import side effect:** `app/ai/assistant/service.py` imports `app.ai.tools.definitions` (`# noqa: F401`) so the tools register; new tool modules must be imported the same way.
- **API contract duplication:** Frontend types in `apps/web/src/lib/types.ts` are hand-maintained mirrors of backend output; there is no generated client. Many endpoints return `dict[str, Any]` instead of Pydantic response models.

## Anti-Patterns

### Doing math or formatting numbers in the LLM path

**What happens:** Letting a prompt or tool return raw rows and asking the model to sum/compare.
**Why it's wrong:** Answers would fail `check_numbers` and break the "Calculated by Faldo" guarantee.
**Do this instead:** Add a service/engine function and expose it through a `@tool` in `apps/api/app/ai/tools/definitions.py` returning formatted amounts (see the `calculate` and `sum_transactions` tools).

### Putting DB access in `app/engine`

**What happens:** Importing sessions/models into engine modules.
**Why it's wrong:** Breaks the property that engine code is pure and unit-testable without Postgres (`apps/api/tests/test_engine.py`).
**Do this instead:** Query in `app/services/<domain>.py`, pass plain values into the engine (see `app/services/check.py` -> `app/engine/check.py`).

### Skipping the owner filter or RLS scope

**What happens:** Opening a session with `get_sessionmaker()()` without `set_user_scope`, or querying by id alone.
**Why it's wrong:** RLS then returns nothing (or, for anonymous scope, unintended rows) and cross-user access is only prevented by one layer.
**Do this instead:** Use `CtxDep` in routes, `scoped_session(user_id)` elsewhere, and `get_owned(...)` from `app/services/common.py` for by-id lookups.

### Calling `fetch` directly from the web app

**What happens:** Bypassing `apps/web/src/lib/api.ts`.
**Why it's wrong:** Loses the required `x-faldo-client` header (backend returns 403), 401 redirect handling and `ApiError` shape.
**Do this instead:** Use `api.get/post/put/patch/delete/upload` and add a hook plus a `keys` entry in `apps/web/src/lib/queries.ts`.

## Error Handling

**Strategy:** Raise typed `AppError` subclasses in services; handlers registered in `app/core/errors.py` convert them (and validation errors) into `application/problem+json` with an `errors` list of `{field, message}`. The web `ApiError` (`apps/web/src/lib/api.ts`) parses that shape; 401 outside public paths redirects to `/login?next=...`.

**Patterns:**
- Routes stay thin; services raise `NotFound`/`Conflict`; ownership via `get_owned`.
- Job failures are logged and retried; inline drain failures are swallowed with `logger.exception` so they never fail the request.
- Assistant stream errors are emitted as an SSE `error` event.
- Route-level React error boundary: `apps/web/src/app/(app)/error.tsx`; loading state `apps/web/src/app/(app)/loading.tsx`.

## Cross-Cutting Concerns

**Logging:** Python `logging` with named loggers (`faldo.deps`, `faldo.worker`, `faldo.ai.tools`, `faldo.assistant`), configured in `apps/api/app/core/logging.py`.
**Validation:** Pydantic v2 schemas in `apps/api/app/schemas/`; query patterns via `Annotated[..., Query(pattern=...)]`; AI tool args validated by each tool's Pydantic `args_model`.
**Authentication:** Server-side sessions (token hash in `sessions`), argon2id passwords, httpOnly SameSite=Lax cookie (`apps/api/app/core/security.py`, `apps/api/app/api/v1/auth.py`); CSRF via Origin allow-list + `x-faldo-client`; rate limiting via `apps/api/app/core/rate_limit.py`.

---

*Architecture analysis: 2026-09-21*
