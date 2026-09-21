# External Integrations

**Analysis Date:** 2026-09-21

## APIs & External Services

**AI (LLM, vision, embeddings):**
- OpenAI - assistant chat with tool calls, natural-language capture, receipt extraction (vision), summaries, and RAG embeddings
  - SDK/Client: `openai` (`AsyncOpenAI`, timeout 45s, 2 retries) in `apps/api/app/ai/providers/openai_provider.py`
  - Endpoints used: `responses.create` (chat/fast/vision models) and `embeddings.create`
  - Auth: `OPENAI_API_KEY`
  - Models (env-configurable): `OPENAI_CHAT_MODEL` (default `gpt-5-mini`), `OPENAI_FAST_MODEL` (`gpt-5-nano`), `OPENAI_VISION_MODEL` (`gpt-5-mini`), `OPENAI_EMBEDDING_MODEL` (`text-embedding-3-small`, 1536 dimensions via `EMBEDDING_DIMENSIONS`)
  - Selection: `apps/api/app/ai/factory.py` picks OpenAI when `AI_PROVIDER=openai`, or when `AI_PROVIDER=auto` and a key is set; otherwise falls back to `LocalDevelopmentProvider` (`apps/api/app/ai/providers/local_provider.py`) and `LocalHashEmbeddings` (`apps/api/app/ai/providers/local_embeddings.py`), which need no network
  - Provider protocols: `apps/api/app/ai/providers/base.py`
  - Guardrails on model output: `apps/api/app/ai/guardrails/` (numeric and output checks); tool definitions in `apps/api/app/ai/tools/`

**Email:**
- Resend - password reset emails
  - Client: direct `httpx` POST to `https://api.resend.com/emails` in `apps/api/app/services/email.py` (10s timeout; failures logged, never raised)
  - Auth: `RESEND_API_KEY`; sender `EMAIL_FROM`
  - Fallback: `EMAIL_PROVIDER=log` (or `auto` without a key) prints the message in development / logs a warning in production
  - Reset links are built from `PUBLIC_APP_URL`; TTL `password_reset_ttl_minutes` (30)

**Fonts:**
- Google Fonts (Geist, Geist Mono, Plus Jakarta Sans) fetched at build time by `next/font/google` in `apps/web/src/app/layout.tsx`

## Data Storage

**Databases:**
- PostgreSQL 17 with extensions `vector` (pgvector), `pg_trgm`, `citext`
  - Runtime connection: `DATABASE_URL` (role `faldo_app`, non-superuser, NOBYPASSRLS); `postgres://`, `postgresql://` and `?sslmode=` URLs are normalized in `apps/api/app/core/db.py`
  - Migration connection: `MIGRATION_DATABASE_URL` (owner role `faldo`); CI uses `ALEMBIC_DATABASE_URL` for migration and `TEST_DATABASE_URL` for tests
  - Client: SQLAlchemy 2 async + asyncpg; models in `apps/api/app/models/` (`identity.py`, `ledger.py`, `planning.py`, `ai.py`, `enums.py`)
  - Multi-tenancy: row-level security enabled per table in `apps/api/migrations/versions/0001_initial_schema.py`; each request sets `app.user_id` via `set_config` (`set_user_scope` / `scoped_session` in `apps/api/app/core/db.py`)
  - Pooling: `DB_POOL=queue` (pool_size 10) for long-running servers, `null` (NullPool) for serverless; `DB_PGBOUNCER=true` disables the asyncpg statement cache for transaction poolers
  - Local bootstrap: `infra/postgres/init.sql` creates extensions and the `faldo_app` role
  - Vector search: pgvector embeddings for RAG in `apps/api/app/ai/rag/` (`indexer.py`, `retriever.py`, `documents.py`)

**File Storage:**
- Receipt images via `ObjectStorage` protocol in `apps/api/app/storage/files.py`
  - `STORAGE_BACKEND=local`: filesystem under `RECEIPT_STORAGE_DIR` (default `var/receipts`; Docker volume `receipts`)
  - `STORAGE_BACKEND=database`: `StoredFile` table (bytea content), used by default on Vercel
  - Max upload `receipt_max_bytes` = 8 MiB

**Caching:**
- None. Rate limiting is in-memory (`MemoryLimiter`) or database-backed (`DatabaseLimiter`) via `RATE_LIMIT_BACKEND` in `apps/api/app/core/rate_limit.py`
- Client-side: TanStack Query cache; `localStorage` for UI preferences (view mode, last account, sound on/off) and `sessionStorage` for the splash gate

**Job queue:**
- Postgres-backed `Job` table (`apps/api/app/jobs/queue.py`, `apps/api/app/jobs/worker.py`); job kinds include `index_entity`, `unindex_entity`, `index_monthly_summary`
- `JOB_MODE=worker`: standalone worker (`python -m app.worker`, compose service `worker`) or in-process loop when `RUN_WORKER_IN_API=true`
- `JOB_MODE=inline`: jobs drained after requests (serverless)

## Authentication & Identity

**Auth Provider:**
- Custom, first-party (no third-party identity provider)
  - Implementation: email + password with Argon2 hashes (`apps/api/app/core/security.py`); opaque random session tokens stored as SHA-256 hashes; HTTP cookie `faldo_session` (`SESSION_COOKIE_NAME`, TTL `SESSION_TTL_DAYS`=30, `COOKIE_SECURE`); routes in `apps/api/app/api/v1/auth.py`, schemas in `apps/api/app/schemas/auth.py`, dependency in `apps/api/app/api/deps.py`
  - Password reset by emailed link (see Resend above); login attempts rate-limited (`login_attempts_per_15_min`)
  - CSRF protection: middleware in `apps/api/app/main.py` requires an allowed `Origin` and header `X-Faldo-Client: web` on unsafe `/api/` requests
  - Web gate: `apps/web/src/proxy.ts` redirects to `/login` when the session cookie is missing (public: `/login`, `/register`, `/forgot-password`, `/reset-password`)
  - Cookies stay first-party because Next rewrites `/api/*` to the API (`apps/web/next.config.ts`)
  - Demo account: seeded by `apps/api/app/seed/demo.py` (`SEED_DEMO_PASSWORD`); the sign-in button is toggled by `NEXT_PUBLIC_SHOW_DEMO_LOGIN`

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Python `logging` configured in `apps/api/app/core/logging.py`; named loggers such as `faldo.email`, `faldo.ai.openai`
- RFC 7807-style `application/problem+json` error responses (`apps/api/app/core/errors.py`)
- Health endpoint: `GET /api/health` (`apps/api/app/main.py`); Postgres healthcheck via `pg_isready` in `docker-compose.yml`
- OpenAPI docs at `/api/docs` and `/api/openapi.json` outside production only

## CI/CD & Deployment

**Hosting:**
- Vercel (API and web as separate projects): `apps/api/vercel.json`, `apps/web/vercel.json`; API build runs migrations via `python -m app.deploy`
- Docker Compose for self-hosting/local: `docker-compose.yml`

**CI Pipeline:**
- GitHub Actions `.github/workflows/ci.yml`, on push to `main` and pull requests
  - `api` job: `pgvector/pgvector:pg17` service, creates extensions and `faldo_app` role, `uv sync --frozen`, `alembic upgrade head`, `ruff check app tests`, `mypy app`, `pytest -q`
  - `web` job: Node 24, `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build`

**Scheduled work:**
- Vercel Cron `0 3 * * *` calls `GET /api/v1/internal/jobs/run`, protected by `Authorization: Bearer $CRON_SECRET` (`apps/api/app/api/v1/internal.py`)

## Environment Configuration

**Required env vars:**
- API: `DATABASE_URL`; `MIGRATION_DATABASE_URL` (recommended, owner role); `PUBLIC_APP_URL` and `ALLOWED_ORIGINS`; `CRON_SECRET` on Vercel; `OPENAI_API_KEY` for real AI; `RESEND_API_KEY` + `EMAIL_FROM` for real email
- Web: `API_ORIGIN` (required on Vercel; build fails otherwise)

**Secrets location:**
- `.env` at repo root (gitignored, present locally), `apps/web/.env.local` (present locally); on Vercel, project environment variables. Templates: `.env.example`, `apps/web/.env.example`

## Webhooks & Callbacks

**Incoming:**
- `GET /api/v1/internal/jobs/run` - cron-triggered job drain (bearer secret, hidden from OpenAPI)
- No third-party webhooks detected

**Outgoing:**
- None. Outbound calls are limited to OpenAI API and `https://api.resend.com/emails`

---

*Integration audit: 2026-09-21*
