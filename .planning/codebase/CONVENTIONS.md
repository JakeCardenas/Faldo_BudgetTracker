# Coding Conventions

**Analysis Date:** 2026-09-21

Monorepo: FastAPI backend in `apps/api` (Python 3.12) and Next.js App Router frontend in `apps/web` (TypeScript, strict). Conventions differ per side; both are listed below.

## Naming Patterns

**Files (backend, `apps/api/app`):**
- `snake_case.py`, one module per domain, mirrored across layers: `engine/money_plan.py`, `services/money_plan.py`, `schemas/planning.py`, `models/planning.py`, `api/v1/planning.py`.
- Migrations: `apps/api/migrations/versions/NNNN_short_description.py` (zero-padded sequence, e.g. `0007_money_plans.py`). Revision IDs are the bare number (`revision = "0007"`, `down_revision = "0006"`).
- Tests: `apps/api/tests/test_<topic>.py`.

**Files (frontend, `apps/web/src`):**
- `kebab-case.tsx` / `.ts` for components and libs: `components/home/safe-to-spend.tsx`, `lib/tools-catalog.ts`, `components/finance/amount-input.tsx`.
- Next.js route files are fixed names: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` under `app/(app)/<route>/`. Route groups: `(app)` (authenticated), `(auth)`.
- shadcn primitives live in `components/ui/` (lowercase kebab names).

**Functions:**
- Python: `snake_case`; private helpers prefixed `_` (`_load` in `services/goals.py`, `_problem` in `core/errors.py`). Services are async and named by verb_noun: `create_goal`, `get_goal_out`, `add_contribution`, `list_goals`.
- TypeScript: `camelCase` functions; React components and hooks follow `PascalCase` / `useXxx`. Query hooks are `useThing` / `useCreateThing` in `lib/queries.ts` (e.g. `useMe`, `useDeleteTransaction`).

**Variables / constants:**
- Python module constants `UPPER_SNAKE` (`PERIOD_DAYS`, `DAYS_PER_MONTH` in `engine/money_plan.py`); tests use `P = 100` (pesos-to-centavos) and `TODAY`.
- TypeScript constants `UPPER_SNAKE` for lookup maps (`SYMBOLS`, `FREQUENCY_LABELS`); locals `camelCase`.
- Money fields are integers in minor units with a `_minor` suffix everywhere (`amount_minor`, `income_minor`, `limit_minor`). Never use floats for money. The frontend types mirror the API's snake_case field names verbatim (`lib/types.ts`), so JSON keys are snake_case in TS too.

**Types / classes:**
- Python classes `PascalCase`; pydantic request models end `In` / `Update` / `Upsert` (`GoalIn`, `GoalUpdate`, `BudgetUpsert`), response models end `Out` (`GoalOut`, `BudgetOut`). Engine inputs are frozen dataclasses ending `Inputs` (`PlanInputs`, `SafeToSpendInputs`).
- SQLAlchemy models are singular `PascalCase` with plural `__tablename__` (`SavingsGoal` -> `savings_goals`).
- Enums are `enum.StrEnum` in `models/enums.py`, stored as non-native varchar with check constraint via `str_enum()` in `models/base.py`.
- TypeScript types/interfaces `PascalCase`, in `lib/types.ts`.

## Code Style

**Formatting:**
- Backend: ruff, `line-length = 120`, `target-version = "py312"` (`apps/api/pyproject.toml`). No separate formatter config; long call signatures are wrapped manually and continuation lines are dense (multiple args per line).
- Frontend: no Prettier config. Style observed: double quotes, no semicolons, 2-space indent, trailing commas in multi-line literals, long lines tolerated (>120 is common).

**Linting:**
- Backend: `ruff check app tests` with rules `E, F, I, B, UP, SIM, ASYNC`; ignored `B008` (FastAPI `Depends` defaults) and `E501`. `mypy app` with `pydantic.mypy` plugin, `check_untyped_defs = true`, `warn_unused_ignores = true`.
- Frontend: ESLint 9 flat config (`apps/web/eslint.config.mjs`) extending `eslint-config-next/core-web-vitals` and `/typescript`; `react/no-unescaped-entities` is off. `tsc --noEmit` with `strict: true`.
- Run all via `make lint` and `make typecheck` (root `Makefile`); CI (`.github/workflows/ci.yml`) runs ruff, mypy, pytest, eslint, tsc and `next build`.

## Import Organization

**Python (ruff `I` enforced):**
1. stdlib (`import uuid`, `from datetime import date`)
2. third party (`fastapi`, `sqlalchemy`, `pydantic`)
3. first party absolute `app.*` imports, alphabetical (`from app.core.errors import ...`, `from app.engine...`, `from app.models...`, `from app.services...`)
- Always absolute `app.` imports; no relative imports.
- Routers import services as modules (`from app.services import budgets, debts, goals`) and call `goals.create_goal(...)`; services import specific names.

**TypeScript:**
1. `"use client"` directive first (when needed)
2. `next/*`, `react`, then third-party (`date-fns`, `lucide-react`, `@tanstack/react-query`)
3. `@/components/...`, then `@/lib/...` (alias `@/*` -> `src/*`, from `tsconfig.json`)
- Use `import type { ... }` / inline `type` for type-only imports (`import type { SafeToSpend } from "@/lib/types"`).
- No barrel `index.ts` files in frontend; import from the file directly.

## Error Handling

**Backend:**
- Raise domain exceptions from `app/core/errors.py`: `AppError` (400) with subclasses `NotFound` (404), `Conflict` (409), `Unauthorized` (401), `RateLimited` (429), `ServiceUnavailable` (503). Messages are user-facing sentences ending with a period: `raise NotFound("Goal not found.")`.
- Handlers in `install_error_handlers` convert everything into RFC 7807-style `application/problem+json` bodies: `{type, title, status, detail, errors?}`. Validation errors become 422 with `errors: [{field, message}]`. Unhandled exceptions are logged with `logger.exception` and return a generic 500.
- Ownership lookups use `get_owned(db, Model, id, user_id, "Label")` from `services/common.py` (raises `NotFound`); services always filter by `user_id` (defense in depth beside Postgres RLS via `scoped_session`).
- Engine functions (`app/engine/*`) are pure and raise `ValueError` / `CalculationError`; they do not touch the DB.
- Routers stay thin: validate with pydantic, call a service, return `response_model` output. Deletes return `Response(status_code=204)`; creates use `status_code=201`.

**Frontend:**
- All HTTP goes through `request` / `api.get|post|put|patch|delete|upload` in `lib/api.ts`, which throws `ApiError(status, message, fieldErrors)`. 401 outside public paths redirects to `/login?next=...`.
- Mutation callers surface errors with sonner toasts: `toast.error(e instanceof ApiError ? e.message : "Couldn't save settings.")`; success uses `toast.success("Settings saved")`.
- Route-level fallbacks: `app/(app)/error.tsx`, `app/(app)/loading.tsx`, `app/not-found.tsx`.

## Logging

**Backend:** stdlib `logging`, one named logger per module in the form `logging.getLogger("faldo.<area>")` (`faldo.errors`, `faldo.deps`, `faldo.ai.assistant`). `core/logging.py` installs a `RedactingFilter` that scrubs API keys, tokens, reset URLs and emails; still avoid logging user data. Log exception class names, not messages, for provider failures (`exc.__class__.__name__`). No `print`.

**Frontend:** no `console` logging in source; user-visible feedback via `toast`.

## Comments

- Module docstring at top of engine/service modules explaining the concept (see `engine/money_plan.py`); short one-line docstrings on non-obvious helpers. Migrations have a docstring with title, description, Revision, Revises, Create Date.
- Inline comments explain the "why" of a business rule, kept short and trailing (`# the starting amount isn't a saving pace`, `# income due today isn't received yet`).
- No JSDoc/TSDoc; TypeScript relies on types.
- `# type: ignore[...]` is used sparingly and with specific codes (`[attr-defined]`, `[no-untyped-def]`, `[type-arg]`); `warn_unused_ignores` is on, so remove stale ones.

## Function Design

- Services take `db: AsyncSession` first, then `user_id`, then entity ids / input models, then `today: date` where date-dependent (`services/goals.py`). The current date and currency come from `ctx.today` / `ctx.currency` (`api/deps.py`, `CtxDep`), never `date.today()` in services; timezone-aware via `today_in(tz)` in `engine/periods.py`.
- Engine functions are deterministic and take a frozen dataclass of inputs, returning dataclasses or dicts (`compute_safe_to_spend(inputs, last_day, period)`, `allocate(PlanInputs(...))`).
- Use modern typing: `X | None`, `list[...]`, PEP 695 generics (`def get_owned[T](...)`, `class Page[T]`).
- Money rounding uses `Decimal` with explicit rounding (`ROUND_FLOOR`) and `minor_factor(currency)`; zero-decimal currencies (JPY) are handled (`floor_unit`, `formatMoney`).
- Frontend: function components with named props typed inline (`{ sts, className }: { sts: SafeToSpend; className?: string }`); use `cn(...)` from `lib/utils.ts` for conditional Tailwind classes.

## Module Design

**Backend layering (import direction):** `api/v1` -> `services` -> `engine` / `models` / `schemas`; `engine` imports nothing from services or models. Schemas base classes: `ApiModel` (`extra="forbid"`, request bodies) and `OutModel` (responses) in `schemas/common.py`; reusable constrained types `Money`, `PositiveMoney`, `Name`, `LongText`, `CurrencyCode`.
- New models compose mixins: `class X(UUIDPk, UserOwned, Timestamps, Base)`; DB constraints are named via the `NAMING_CONVENTION` in `models/base.py`, and check constraints use short names (`CheckConstraint("limit_minor > 0", name="limit_positive")`).
- Export new models from `app/models/__init__.py`.
- Routers are grouped per domain in `app/api/v1/*.py`, each `router = APIRouter()` with `tags=[...]` per route.

**Frontend:**
- Named exports for components/helpers; default exports only for Next.js route files (`page.tsx`, `layout.tsx`).
- Client components start with `"use client"`.
- Data fetching only via React Query hooks in `lib/queries.ts`; add a key to the `keys` object and add its root to `invalidateFinancialData` when a new financial query is introduced. Mutations call `invalidateFinancialData(qc)` in `onSuccess`.
- Shared UI: `components/ui/*` (shadcn, cva), `components/ios/*` (iOS-style list/sheet/segmented), `components/finance/*` (money widgets). Global utility classes (`card-surface`, `section-title`, `display-number`, `tabular`) come from `app/globals.css`.
- Display formatting (money, dates) goes through `lib/format.ts` (`formatMoney`, `toMinor`, `formatDate`); never format currency inline.

---

*Convention analysis: 2026-09-21*
