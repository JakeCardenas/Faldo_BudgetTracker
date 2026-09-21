# Codebase Structure

**Analysis Date:** 2026-09-21

## Directory Layout

```
Faldo/
├── apps/
│   ├── api/                    # FastAPI backend (Python 3.12, uv)
│   │   ├── app/
│   │   │   ├── main.py         # App factory, middleware, router mounting
│   │   │   ├── worker.py       # Standalone job worker entry
│   │   │   ├── deploy.py       # Runs alembic upgrade head on build
│   │   │   ├── api/            # deps.py (Ctx) + v1/ routers
│   │   │   ├── services/       # Domain logic + DB queries
│   │   │   ├── engine/         # Pure deterministic finance math
│   │   │   ├── models/         # SQLAlchemy ORM + enums
│   │   │   ├── schemas/        # Pydantic request/response models
│   │   │   ├── ai/             # assistant, tools, providers, rag, capture, guardrails, receipts
│   │   │   ├── jobs/           # Postgres job queue + worker loop
│   │   │   ├── core/           # config, db, errors, logging, rate_limit, security
│   │   │   ├── storage/        # Receipt file storage
│   │   │   └── seed/           # Demo data (python -m app.seed.demo)
│   │   ├── migrations/         # Alembic env + versions/0001..0007
│   │   ├── tests/              # pytest suite (real Postgres)
│   │   ├── alembic.ini
│   │   ├── pyproject.toml, uv.lock
│   │   ├── Dockerfile
│   │   └── vercel.json         # Cron for /api/v1/internal/jobs/run
│   └── web/                    # Next.js 16 frontend (TypeScript, Tailwind v4)
│       ├── src/
│       │   ├── app/            # App Router: (app)/, (auth)/, onboarding/, root layout
│       │   ├── components/     # Feature + UI components
│       │   ├── lib/            # api client, queries, types, format, catalogs
│       │   ├── hooks/          # (empty)
│       │   └── proxy.ts        # Session-cookie route guard
│       ├── public/             # brand/, sounds/
│       ├── next.config.ts      # /api rewrite, security headers
│       ├── components.json     # shadcn config
│       ├── Dockerfile, vercel.json
│       └── package.json
├── docs/                       # FALDO_PRODUCT_SPEC.md, IMPLEMENTATION_PLAN.md
├── infra/postgres/init.sql     # DB init (roles, extensions)
├── .github/workflows/ci.yml    # Lint, mypy, pytest, web lint/tsc/build
├── docker-compose.yml          # db (pgvector pg17), api, worker, web
├── Makefile                    # up/down/migrate/seed/api/worker/web/test/lint/typecheck/build
├── .env.example
└── README.md
```

## Directory Purposes

**`apps/api/app/api/v1/`:**
- Purpose: HTTP routers, one module per domain, all prefixed `/api/v1`.
- Contains: `auth.py` (register/login/sessions/me/export/password), `ledger.py` (accounts, categories, transactions, notes), `planning.py` (budgets, goals, recurring, debts, planned purchases, money plan), `intelligence.py` (dashboard, reports, forecast, scenarios, insights, capture, receipts, assistant, search), `engagement.py`, `internal.py` (cron).
- Key files: `apps/api/app/api/deps.py` (`CtxDep`, `AnonDbDep`).

**`apps/api/app/services/`:**
- Purpose: Business logic per domain, plus cross-domain aggregates.
- Contains: `accounts.py`, `budgets.py`, `categories.py`, `transactions.py`, `goals.py`, `recurring.py`, `debts.py`, `planned.py`, `money_plan.py`, `check.py`, `forecast.py` (also hosts `safe_to_spend`), `dashboard.py`, `pulse.py`, `analytics.py`, `reports.py`, `insights.py`, `health.py`, `engagement.py`, `receipts.py`, `email.py`, `common.py` (`get_owned`, `normalize_name`, `apply_updates`).

**`apps/api/app/engine/`:**
- Purpose: Pure functions and frozen dataclasses. No DB or network.
- Contains: `money.py`, `periods.py`, `planning.py`, `safe_to_spend.py`, `forecast.py`, `scenarios.py`, `check.py`, `money_plan.py`, `health.py`, `analysis.py`, `calculator.py`.

**`apps/api/app/ai/`:**
- `assistant/service.py`: `stream_answer`, system prompt, tool loop.
- `tools/registry.py` (`@tool`, `ToolContext`, `run_tool`, `tool_specs`) and `tools/definitions.py` (all tool handlers).
- `providers/`: `base.py` (Protocols), `openai_provider.py`, `local_provider.py`, `local_embeddings.py`.
- `rag/`: `documents.py` (renderers), `indexer.py`, `retriever.py`.
- `capture/`: `rules.py` (deterministic parser), `service.py` (rules + LLM).
- `guardrails/`: `numeric.py`, `output.py`.
- `receipts/`: package placeholder (`__init__.py` only); receipt logic lives in `app/services/receipts.py`.
- `factory.py` (`get_llm`, `get_embeddings`), `schemas.py` (AI structured-output models).

**`apps/api/app/models/`:**
- `base.py` (Base, mixins, `str_enum`), `enums.py`, `identity.py` (User, UserSettings, Session, AuthToken), `ledger.py` (Account, Category, Merchant, Tag, Transaction, TransactionItem), `planning.py` (Budget, SavingsGoal, RecurringPayment, Debt, PlannedPurchase, MoneyPlan, ...), `ai.py` (Receipt, MemoryDocument, AIInsight, AIConversation, AIMessage, Job, StoredFile, RateLimitHit). All re-exported from `app/models/__init__.py`.

**`apps/api/app/schemas/`:**
- `auth.py`, `common.py`, `ledger.py`, `planning.py`.

**`apps/api/app/core/`:**
- `config.py` (`Settings`, `get_settings`), `db.py` (engine, `set_user_scope`, `scoped_session`), `errors.py`, `logging.py`, `rate_limit.py`, `security.py` (hashing, tokens).

**`apps/api/tests/`:**
- pytest modules named `test_<area>.py`; shared fixtures in `conftest.py`.

**`apps/web/src/app/`:**
- `(app)/`: authenticated routes under `AppShell`: `page.tsx` (Home), `accounts`, `accounts/[id]`, `assistant`, `bills`, `budgets`, `debts`, `forecast`, `goals`, `insights`, `learn`, `learn/[slug]`, `plan`, `plan/money`, `reports`, `settings`, `streaks`, `tools`, `tools/[tool]`, `transactions`.
- `(auth)/`: `login`, `register`, `forgot-password`, `reset-password/[token]` with a shared `layout.tsx`.
- `onboarding/page.tsx`, `layout.tsx`, `providers.tsx`, `manifest.ts`, `not-found.tsx`, `globals.css`.

**`apps/web/src/components/`:**
- `ui/`: shadcn/Radix primitives (button, dialog, sheet, select, ...). Generated via shadcn; edit sparingly.
- `ios/`: iOS-style building blocks (`list`, `nav-header`, `panel`, `segmented`, `sheet`, `stat-tile`).
- `layout/`: `app-shell.tsx`, `app-context.tsx`, `nav.ts`, `sidebar.tsx`, `mobile-nav.tsx`, `more-sheet.tsx`, `command-search.tsx`, `actions-catalog.tsx`, `notifications.tsx`, `page-header.tsx`, `streak-chip.tsx`, `user-menu.tsx`.
- `home/`: `safe-to-spend.tsx`, `attention.tsx`, `cards.tsx`, `greeting.tsx`, `quick-actions.tsx`.
- `decide/`: `faldo-check.tsx`, `planned.tsx`.
- `capture/`: `add-transaction-dialog.tsx`, `keypad-entry.tsx`, `draft-card.tsx`.
- `finance/`: shared finance widgets (`money.tsx`, `amount-input.tsx`, `transaction-form.tsx`, `transaction-row.tsx`, `transaction-sheet.tsx`, `account-dialog.tsx`, `calculation-card.tsx`, `insight-card.tsx`, `progress-bar.tsx`, `stat.tsx`, `day-groups.tsx`, `empty-state.tsx`, `category-icon.tsx`).
- `assistant/`: `blocks.tsx`, `logged-card.tsx`. `wallet/`: `account-card.tsx`. `charts/`: `charts.tsx`. `brand/`: logo, mascot, scene, splash, welcome-splash. `tools/`: one component per tool (`currency`, `emergency`, `loan`, `notes`, `split`, `tax`) plus `shared.tsx`. Top-level: `auth-form.tsx`, `sound-effects.tsx`.

**`apps/web/src/lib/`:**
- `api.ts` (fetch client, `ApiError`), `queries.ts` (query keys + hooks), `types.ts` (API types), `format.ts` (money/date formatting), `utils.ts` (`cn`), `catalog.ts`, `tools-catalog.ts`, `lessons.ts`, `account-templates.ts`, `goal-icons.tsx`, `calculator.ts`, `sound.ts`.

## Key File Locations

**Entry Points:**
- `apps/api/app/main.py`: API app.
- `apps/api/app/worker.py`: worker process.
- `apps/web/src/app/layout.tsx`: web root layout; `apps/web/src/app/(app)/layout.tsx`: authenticated shell.
- `apps/web/src/proxy.ts`: route guard (Next.js proxy/middleware).

**Configuration:**
- `apps/api/app/core/config.py`: all backend settings (env-driven via pydantic-settings).
- `.env.example`: documented env vars (existence only).
- `apps/api/pyproject.toml`, `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/eslint.config.mjs`, `apps/web/next.config.ts`, `apps/web/components.json`.
- `docker-compose.yml`, `infra/postgres/init.sql`, `apps/api/vercel.json`, `apps/web/vercel.json`.

**Core Logic:**
- `apps/api/app/engine/safe_to_spend.py` and `apps/api/app/services/forecast.py`: Safe to Spend.
- `apps/api/app/engine/money_plan.py` + `apps/api/app/services/money_plan.py`: Money Plan.
- `apps/api/app/engine/check.py` + `apps/api/app/services/check.py`: Faldo Check.
- `apps/api/app/ai/tools/definitions.py`: AI tool catalogue.
- `apps/api/app/ai/assistant/service.py`: assistant orchestration.

**Testing:**
- `apps/api/tests/`: backend tests (`test_engine.py`, `test_safe_to_spend.py`, `test_check.py`, `test_money_plan.py`, `test_planned.py`, `test_money_owed.py`, `test_engagement.py`, `test_ai.py`, `test_ai_guardrails.py`, `test_capture_rules.py`, `test_api.py`, `test_platform.py`, `test_income_and_forecast_inputs.py`).
- The web app has no test suite; CI runs `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Naming Conventions

**Files:**
- Backend: `snake_case.py`; one module per domain, with the same stem across layers (`money_plan.py` exists in `engine/` and `services/`; `planning.py` in `models/`, `schemas/`, `engine/`, `api/v1/`).
- Migrations: `NNNN_short_description.py` sequential four-digit prefix (`0007_money_plans.py`).
- Tests: `tests/test_<area>.py`.
- Web: `kebab-case.tsx` for components (`faldo-check.tsx`), `page.tsx`/`layout.tsx`/`loading.tsx`/`error.tsx` per Next.js convention, `lib/*.ts` lowercase kebab.

**Directories:**
- Web routes use lowercase kebab-case segments; route groups `(app)`, `(auth)`; dynamic segments `[id]`, `[slug]`, `[tool]`, `[token]`.
- Web components grouped by feature (`home/`, `decide/`, `capture/`, `finance/`), not by type.

**Code identifiers:**
- Python: functions `snake_case`, classes `PascalCase`, money fields suffixed `_minor`, enums `StrEnum` in `app/models/enums.py`.
- API paths: kebab-case (`/money-plan`, `/auth/password/forgot`); JSON keys snake_case.
- TS: components `PascalCase`, hooks `useX` in `lib/queries.ts`, imports via `@/` alias (`@/lib/api`, `@/components/...`).

## Where to Add New Code

**New backend feature (endpoint + logic):**
- Pure math: `apps/api/app/engine/<feature>.py` (dataclass inputs, no DB).
- Queries/orchestration: `apps/api/app/services/<feature>.py` taking `(db, user_id, settings, today, ...)`.
- Schemas: add to the matching module in `apps/api/app/schemas/` (`ledger.py` or `planning.py`).
- Route: add to the matching router in `apps/api/app/api/v1/` using `ctx: CtxDep`; a new router module must be imported and added to the tuple in `create_app` in `apps/api/app/main.py`.
- Tests: `apps/api/tests/test_<feature>.py`.

**New table:**
- Model in `apps/api/app/models/<domain>.py` using `UUIDPk, UserOwned, Timestamps, Base`; export in `apps/api/app/models/__init__.py`; add the next `apps/api/migrations/versions/NNNN_*.py` including the RLS `ENABLE ROW LEVEL SECURITY` + `<table>_owner` policy.

**New AI tool:**
- Handler decorated with `@tool(...)` in `apps/api/app/ai/tools/definitions.py`, reusing a service function; add follow-ups in `FOLLOW_UPS` in `apps/api/app/ai/assistant/service.py` if relevant.

**New background job kind:**
- Add an `enqueue_*` helper in `apps/api/app/jobs/queue.py` and a branch in `handle` in `apps/api/app/jobs/worker.py`.

**New web page:**
- `apps/web/src/app/(app)/<route>/page.tsx` (client components where hooks are used); add to `apps/web/src/components/layout/nav.ts` if it needs navigation (and `PLAN_ROUTES` if it belongs under the Plan tab).

**New web data access:**
- Types in `apps/web/src/lib/types.ts`, key in `keys` and a hook in `apps/web/src/lib/queries.ts`; invalidate related keys on mutation.

**New web component:**
- Feature component in `apps/web/src/components/<feature>/kebab-name.tsx`; iOS-style primitives in `components/ios/`; shadcn primitives in `components/ui/`. Add money-tool UIs in `components/tools/` and register in `apps/web/src/lib/tools-catalog.ts`.

**Utilities:**
- Backend shared helpers: `apps/api/app/services/common.py` or `apps/api/app/core/`. Frontend: `apps/web/src/lib/utils.ts`, `apps/web/src/lib/format.ts`.

## Special Directories

**`apps/api/migrations/versions/`:**
- Purpose: Alembic revision scripts (0001 initial schema with RLS, 0002 serverless auth/storage, 0003 app experience, 0004 money owed movements, 0005 planned purchases, 0006 goal start / one-time income, 0007 money plans).
- Generated: Authored via Alembic. Committed: Yes.

**`apps/web/.next/`, `apps/web/node_modules/`, `apps/api/.venv/`, `.mypy_cache/`, `.ruff_cache/`, `.pytest_cache/`, `__pycache__/`:**
- Purpose: Build output, dependencies, tool caches.
- Generated: Yes. Committed: No.

**`apps/web/public/`:**
- Purpose: Static assets (`brand/`, `sounds/`), excluded from the auth guard matcher in `apps/web/src/proxy.ts`.
- Generated: No. Committed: Yes.

**`docs/`:**
- Purpose: Product spec and implementation plan.
- Generated: No. Committed: Yes.

**`.planning/codebase/`:**
- Purpose: Codebase reference documents.
- Generated: Yes. Committed: Per project workflow.

---

*Structure analysis: 2026-09-21*
