# Technology Stack

**Analysis Date:** 2026-09-21

## Languages

**Primary:**
- Python >=3.12 (developed on 3.12.x) - Backend API, worker, engines, migrations, seed data (`apps/api/`)
- TypeScript 5.x (strict mode) - Web frontend (`apps/web/src/`)

**Secondary:**
- SQL (PostgreSQL DDL via Alembic and `infra/postgres/init.sql`) - schema, row-level security, extensions
- CSS (Tailwind v4, `apps/web/src/app/globals.css`)

## Runtime

**Environment:**
- Python 3.12 (`python:3.12-slim` in `apps/api/Dockerfile`)
- Node.js 24 (`node:24-alpine` in `apps/web/Dockerfile`; CI uses Node 24)
- PostgreSQL 17 with pgvector (`pgvector/pgvector:pg17`)

**Package Manager:**
- API: `uv` (Dockerfile pins `ghcr.io/astral-sh/uv:0.12`); `[tool.uv] package = false` in `apps/api/pyproject.toml`
- Web: npm
- Lockfiles: `apps/api/uv.lock` present, `apps/web/package-lock.json` present

## Frameworks

**Core:**
- FastAPI >=0.141 - HTTP API (`apps/api/app/main.py`), routers under `apps/api/app/api/v1/`
- Uvicorn[standard] >=0.52 - ASGI server
- SQLAlchemy[asyncio] >=2.0.52 + asyncpg >=0.31 - async ORM/driver (`apps/api/app/core/db.py`)
- Alembic >=1.20 - migrations (`apps/api/alembic.ini`, `apps/api/migrations/versions/0001`..`0007`)
- Pydantic >=2.13 / pydantic-settings >=2.15 - schemas (`apps/api/app/schemas/`) and config (`apps/api/app/core/config.py`)
- Next.js 16.3.5 (App Router, React Server Components enabled) - web app (`apps/web/src/app/`)
- React 19.2.8 / react-dom 19.2.8

**Testing:**
- pytest >=9.1 + pytest-asyncio >=1.4 (`asyncio_mode = "auto"`, session-scoped loops) - `apps/api/tests/`
- No web test framework detected

**Build/Dev:**
- Tailwind CSS 4 with `@tailwindcss/postcss` (`apps/web/postcss.config.mjs`), `tw-animate-css`
- shadcn CLI 4.x, style `radix-nova`, neutral base, lucide icons (`apps/web/components.json`)
- ESLint 9 + `eslint-config-next` 16.3.5 (`apps/web/eslint.config.mjs`)
- Ruff >=0.16 (line-length 120, rules E,F,I,B,UP,SIM,ASYNC; ignores B008,E501) and mypy >=1.18 (pydantic plugin, `check_untyped_defs`) configured in `apps/api/pyproject.toml`
- Docker / Docker Compose (`docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`)
- Makefile task runner (`Makefile`: `up`, `migrate`, `seed`, `api`, `worker`, `web`, `test`, `lint`, `typecheck`, `build`)

## Key Dependencies

**Critical (API, `apps/api/pyproject.toml`):**
- `openai` >=3.13 - LLM, vision and embeddings via Responses/Embeddings APIs (`apps/api/app/ai/providers/openai_provider.py`)
- `pgvector` >=0.5 - vector similarity for RAG (`apps/api/app/ai/rag/`)
- `argon2-cffi` >=25.1 - password hashing (`apps/api/app/core/security.py`)
- `httpx` >=0.28 - outbound HTTP (Resend email in `apps/api/app/services/email.py`)
- `pillow` >=12.3 - receipt image handling (`apps/api/app/services/receipts.py`)
- `python-multipart` >=0.0.32 - receipt upload form parsing
- `email-validator` >=2.3 - email field validation

**Critical (Web, `apps/web/package.json`):**
- `@tanstack/react-query` ^5.102.8 - server-state cache (`apps/web/src/lib/queries.ts`, `apps/web/src/app/providers.tsx`)
- `radix-ui` ^1.6.7, `cmdk`, `sonner`, `react-day-picker` ^10, `class-variance-authority`, `clsx`, `tailwind-merge` - UI primitives (`apps/web/src/components/ui/`)
- `recharts` ^3.10.1 - charts (`apps/web/src/components/charts/`)
- `date-fns` ^4.4.0 - date handling
- `next-themes` ^0.4.6 - light/dark theme
- `lucide-react` - icons

**Infrastructure:**
- Google Fonts via `next/font/google`: Geist, Geist Mono, Plus Jakarta Sans (`apps/web/src/app/layout.tsx`)
- Postgres extensions `vector`, `pg_trgm`, `citext` (`infra/postgres/init.sql`)

## Configuration

**Environment:**
- API settings are a pydantic-settings class `Settings` in `apps/api/app/core/config.py`, read from process env and `.env` / `../../.env`; `lru_cache`d via `get_settings()`
- Vercel detection via `VERCEL` env var flips defaults (production environment, NullPool, inline jobs, database storage, database rate limiting, secure cookies, trusted proxy headers)
- `.env.example` at repo root documents variables; `.env` (gitignored) and `apps/web/.env.local`, `apps/web/.env.example` exist - contents not read
- Key API variables (names only): `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_FAST_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_EMBEDDING_MODEL`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `DB_POOL`, `DB_PGBOUNCER`, `PUBLIC_APP_URL`, `ALLOWED_ORIGINS`, `COOKIE_SECURE`, `SESSION_TTL_DAYS`, `JOB_MODE`, `RUN_WORKER_IN_API`, `CRON_SECRET`, `STORAGE_BACKEND`, `RECEIPT_STORAGE_DIR`, `RATE_LIMIT_BACKEND`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `SEED_DEMO_PASSWORD`, `ENVIRONMENT`, `RUN_MIGRATIONS_ON_BUILD`
- Key web variables: `API_ORIGIN` (rewrite target for `/api/*`), `NEXT_PUBLIC_SHOW_DEMO_LOGIN`, `BUILD_STANDALONE`, `VERCEL_PROJECT_PRODUCTION_URL`

**Build:**
- `apps/web/next.config.ts` - rewrites `/api/:path*` to `API_ORIGIN`, security headers, `output: "standalone"` when `BUILD_STANDALONE=1`; throws on Vercel if `API_ORIGIN` unset
- `apps/web/tsconfig.json` - strict, path alias `@/*` -> `./src/*`
- `apps/web/src/proxy.ts` - Next.js request proxy (middleware) redirecting unauthenticated users to `/login` based on the `faldo_session` cookie
- `apps/api/alembic.ini`, `apps/api/migrations/`
- `apps/api/vercel.json` (cron) and `apps/web/vercel.json` (framework: nextjs); API build script `python -m app.deploy` runs `alembic upgrade head` (skippable with `RUN_MIGRATIONS_ON_BUILD`)

## Platform Requirements

**Development:**
- Docker (for Postgres 17 + pgvector) or a local Postgres with `vector`, `pg_trgm`, `citext` extensions and roles `faldo` (owner/migrations) and `faldo_app` (runtime, NOBYPASSRLS)
- Python 3.12 + uv; Node 24 + npm
- Run: `make up` (full compose stack + migrate + seed), or `make api` / `make worker` / `make web` individually
- Ports: web 3000, API 8000, Postgres 5432

**Production:**
- Two deployment paths: Docker Compose services (`db`, `api`, `worker`, `web`; API image runs `alembic upgrade head` then uvicorn with `--proxy-headers`; web is a Next standalone build) or Vercel (separate API and web projects, API using inline jobs and a daily Vercel Cron)
- Runs as non-root users (`faldo`) in both containers

---

*Stack analysis: 2026-09-21*
