# Codebase Concerns

**Analysis Date:** 2026-09-21

Scope: full repo (`apps/api` FastAPI + Postgres, `apps/web` Next.js). The working tree has uncommitted "Money Plan" work (see Fragile Areas). No `TODO`/`FIXME`/`HACK` markers exist in `apps/api/app` or `apps/web/src`; the concerns below come from reading the code.

## Tech Debt

**Background jobs have no stuck-job recovery:**
- Issue: `_claim()` in `apps/api/app/jobs/worker.py` sets `status=running` in its own committed transaction and processing happens afterwards. If the process dies (Vercel function timeout, container restart, worker crash) between claim and `_finish()`, the row stays `running` forever. Nothing reclaims `running` jobs.
- Files: `apps/api/app/jobs/worker.py`, `apps/api/app/jobs/queue.py`
- Impact: Receipt extraction (`extract_receipt`) can leave a receipt in `processing` permanently; embeddings/index entries silently go stale.
- Fix approach: Add `locked_at`/heartbeat to `Job` and re-queue `running` rows older than N minutes in `_claim()`.

**Unknown or user-less jobs are silently marked done:**
- Issue: `handle()` returns without error when `job.user_id is None`, and unknown `job.kind` only logs a warning. `run_once()` then calls `_finish(..., JobStatus.done)`.
- Files: `apps/api/app/jobs/worker.py`
- Impact: Typos in job kinds or a new job kind deployed before its handler are lost with no failure record.
- Fix approach: Raise for unknown kinds so they hit the retry/`failed` path.

**Job table and auth tables grow without cleanup:**
- Issue: Only `rate_limit_hits` is purged (probabilistically, 2% of requests, in `DatabaseLimiter.hit`). Expired/revoked `sessions`, used/expired `auth_tokens`, and `done`/`failed` `jobs` are never deleted.
- Files: `apps/api/app/core/rate_limit.py`, `apps/api/app/api/deps.py`, `apps/api/app/jobs/worker.py`
- Impact: Slow unbounded table growth; the `Session` lookup in `get_ctx` runs on every request.
- Fix approach: Add a periodic cleanup job (the Vercel cron in `apps/api/vercel.json` already hits `/api/v1/internal/jobs/run` daily).

**Offset-based transaction pagination:**
- Issue: The cursor is a base64 offset (`_encode_cursor(offset)`), so inserts between page fetches cause duplicated/skipped rows, and deep offsets get slower.
- Files: `apps/api/app/services/transactions.py` (lines ~129-170)
- Impact: Inconsistent lists and a slow full export for users with many transactions (`GET /me/export` in `apps/api/app/api/v1/auth.py` loops pages of 100 through this cursor).
- Fix approach: Keyset pagination on `(occurred_on, id)`; have export use a single streaming query.

**Assistant streams while holding an open DB transaction:**
- Issue: `stream_answer` in `apps/api/app/ai/assistant/service.py` wraps the whole LLM tool loop (up to `MAX_ROUNDS=6` plus a repair pass, each an OpenAI call with a 45s timeout) plus an artificial `asyncio.sleep(0.012)` per 3-word chunk inside one `scoped_session`.
- Files: `apps/api/app/ai/assistant/service.py`, `apps/api/app/api/v1/intelligence.py`
- Impact: One pooled connection (pool size 10 in `apps/api/app/core/db.py`) is held per in-flight answer, so ~10 concurrent assistant requests can exhaust the pool for the whole API. If the client disconnects mid-stream, the generator is cancelled and the user's message and conversation row are rolled back (never persisted).
- Fix approach: Run LLM calls outside the transaction, commit the user message first, and open short scoped sessions per tool call. Drop the artificial delay or make it frontend-only.

**Frontend `shadcn` CLI is a runtime dependency:**
- Issue: `shadcn` is listed under `dependencies` in `apps/web/package.json`; it is a code-generation CLI.
- Impact: Larger install/build footprint. Fix: move to `devDependencies`.

**Placeholder/odd Next config flags:**
- Issue: `apps/web/next.config.ts` sets `agentRules: false` and `compress: false` without explanation.
- Impact: Confusion for maintainers; `compress: false` disables gzip if the app is self-hosted (Docker `standalone`) without a compressing proxy.

**Migration 0006 backfill relies on a display string:**
- Issue: `apps/api/migrations/versions/0006_goal_start_and_one_time_income.py` sets `is_initial = true WHERE note = 'Starting amount'`, and also widens `user_settings.pay_frequency` to allow `'once'`, which is meaningless for a pay schedule.
- Impact: Goals whose starting contribution had an edited note are misclassified; a `once` pay frequency is accepted by the DB constraint.
- Fix approach: Validate `pay_frequency != once` in `apps/api/app/schemas/auth.py`/DB check; treat the backfill as one-time-only.

**Migration date stamps are ahead of the repo date:**
- Issue: `0006` and `0007` are stamped `Create Date: 2026-09-22`, one day after the current date, and are untracked in git.
- Impact: Cosmetic, but they are not committed, so CI and deploys (`python -m app.deploy` runs `alembic upgrade head` on build) will not include them until committed.

## Known Bugs

**Not detected as confirmed bugs.** The following are behaviours likely to surprise:

**Registration reveals whether an email exists:**
- Symptoms: `POST /auth/register` returns 409 "An account with this email already exists." while `forgot_password` is carefully non-enumerating.
- Files: `apps/api/app/api/v1/auth.py` (`register`)
- Trigger: Submit a known email. Only rate-limited (10/hour/IP).

**Money Plan "Joy Money" excludes recurring-linked spending by construction:**
- Symptoms: `bucket_spending()` in `apps/api/app/services/money_plan.py` skips any expense with `recurring_payment_id` set and treats every non-essential (or uncategorised, via `coalesce(is_essential, False)`) expense as Joy Money.
- Impact: Uncategorised spending is counted as "wants"; users who do not mark categories essential see Needs at zero and Joy overspent.

## Security Considerations

**Login lockout can be used to deny service:**
- Risk: `login` in `apps/api/app/api/v1/auth.py` rate-limits per email (`login-email:{email}`, 10 per 15 min) regardless of IP, so anyone can lock a known user out of signing in by submitting bad passwords.
- Current mitigation: Per-IP limit is 3x higher; window is 15 minutes.
- Recommendations: Key the email limiter on `(email, ip)` or add CAPTCHA/progressive delay.

**Rate limiting is per-process by default and IP derivation trusts headers:**
- Risk: `MemoryLimiter` in `apps/api/app/core/rate_limit.py` is the default off Vercel (`rate_limit_backend="memory"`), so multiple API replicas/workers each keep their own counters. `_client_ip` trusts `x-real-ip`/`x-forwarded-for` whenever `trust_proxy_headers` is true (default on Vercel); behind any other proxy that does not overwrite them, clients can spoof IPs to bypass per-IP limits.
- Files: `apps/api/app/core/rate_limit.py`, `apps/api/app/api/v1/auth.py` (`_client_ip`), `apps/api/app/core/config.py`
- Recommendations: Use `database` backend in any multi-instance deploy; take only the rightmost trusted hop of `x-forwarded-for`.

**CSRF protection depends on a custom header plus optional Origin:**
- Risk: `csrf_and_headers` in `apps/api/app/main.py` blocks unsafe methods without `x-faldo-client: web` and rejects a mismatched `Origin` only when an Origin is present. Cookie is `SameSite=Lax` (`_start_session`). This is adequate today because custom headers force a CORS preflight, but no CORS middleware is configured, and any future GET that mutates state would be unprotected.
- Recommendations: Keep all mutations on unsafe methods; note `GET /internal/jobs/run` mutates (drains jobs) but is guarded by the cron secret.

**Cron/internal endpoint on GET:**
- Risk: `GET /api/v1/internal/jobs/run` (`apps/api/app/api/v1/internal.py`) runs up to 500 jobs, authorised only by `CRON_SECRET` bearer. If `CRON_SECRET` is unset it always returns 401 (safe), but on Vercel the cron will then silently fail and no job processing happens beyond inline draining.
- Recommendations: Fail startup (or log an error) when `job_mode="inline"` in production and `CRON_SECRET` is missing.

**Session cookie presence is trusted by the web proxy:**
- Risk: `apps/web/src/proxy.ts` only checks that a `faldo_session` cookie exists; real validation happens in the API. Pages are gated by redirect only, so a forged cookie shows the shell until the first API 401 triggers the redirect in `apps/web/src/lib/api.ts`.
- Recommendations: Acceptable for a client-rendered app; do not put sensitive data in server-rendered page output.

**Demo login and demo credentials:**
- Risk: `NEXT_PUBLIC_SHOW_DEMO_LOGIN` defaults to `true` in `docker-compose.yml` and the README documents a default `SEED_DEMO_PASSWORD` (`apps/api/app/seed/demo.py`). If production seeds demo data with the default password, the demo account is publicly guessable.
- Files: `docker-compose.yml`, `apps/web/src/components/auth-form.tsx`, `apps/api/app/seed/demo.py`, `README.md`
- Recommendations: Require `SEED_DEMO_PASSWORD` explicitly when `ENVIRONMENT=production`; default the compose flag to `false`.

**Default DB credentials in config and compose:**
- Risk: `apps/api/app/core/config.py` defaults `database_url` to `faldo_app:faldo_app@localhost` and `infra/postgres/init.sql` creates the `faldo_app` role with a fixed password; `docker-compose.yml` publishes Postgres on host port 5432. Local-only, but the same role definition would be dangerous if reused on a shared host.
- Recommendations: Bind the port to `127.0.0.1` and source the app-role password from env.

**Password-reset link is emailed and, without Resend, printed to stdout:**
- Risk: `apps/api/app/services/email.py` prints the full email body (including the reset link) with `print()` when `EMAIL_PROVIDER` resolves to `log` in non-production. The log redaction filter in `apps/api/app/core/logging.py` only covers `logging`, not `print`.
- Recommendations: Confined to development; ensure `ENVIRONMENT` is `production` wherever real users exist (it defaults to `production` only when `VERCEL` is set, otherwise `development`).

**Row-level security depends on connecting as the restricted role:**
- Risk: Tenant isolation relies on Postgres RLS policies keyed on `app.user_id` (migrations `0001`, `0002`, `0005`, `0007`) AND on the API connecting as `faldo_app` (NOSUPERUSER NOBYPASSRLS). If `DATABASE_URL` points at an owner/superuser role, RLS is bypassed silently. Service queries also filter by `user_id` explicitly, which is good defence in depth. `0001` uses `ENABLE` and `0002` adds `FORCE` for the initial tables; every new table must add both (as `0005`/`0007` do).
- Files: `apps/api/migrations/versions/*.py`, `apps/api/app/core/db.py`
- Recommendations: Add a startup/CI assertion that the current role is not a superuser and does not have `BYPASSRLS`.

**LLM prompt injection surface:**
- Risk: The assistant reads user-authored text (notes, merchants, item names) through tools. `SYSTEM_PROMPT` rule 8 says to ignore instructions in tool data and the assistant has no write tools, which contains the blast radius; `apps/api/app/ai/guardrails/numeric.py` validates figures and `output.py` sanitises markdown.
- Files: `apps/api/app/ai/assistant/service.py`, `apps/api/app/ai/guardrails/`
- Recommendations: Keep the assistant read-only; extend `tests/test_ai_guardrails.py` whenever tools gain side effects.

## Performance Bottlenecks

**Inline job draining inside the request lifecycle:**
- Problem: On Vercel (`job_mode="inline"`), `get_ctx` in `apps/api/app/api/deps.py` runs `drain(settings.inline_job_limit=25, user_id)` after every mutating request, after the response body is produced but within the same function invocation. Embedding/receipt calls to OpenAI can add seconds to the tail of write requests.
- Cause: No true background executor on serverless.
- Improvement path: Enqueue only, and rely on cron/queue product; or cap inline drain to cheap jobs and defer `extract_receipt`.

**Per-request DB work in hot paths:**
- Problem: `GET /insights` defaults to `refresh=True` and recomputes insights on each call (`apps/api/app/api/v1/intelligence.py`); Safe to Spend, forecast and Money Plan (`apps/api/app/services/money_plan.py`) each re-query recurring payments and expand occurrences in Python (`primary_income`, `monthly_commitments`, `plan_period` are called repeatedly per request, e.g. `plan_week` re-runs them).
- Improvement path: Compute shared inputs once per request and pass them down; cache insights per period.

**Global search runs many unindexed `ILIKE '%q%'` scans:**
- Problem: `GET /search` in `apps/api/app/api/v1/intelligence.py` issues ~7 queries with leading-wildcard `ilike` plus pgvector search per keystroke.
- Improvement path: Use `pg_trgm` GIN indexes (the extension is already installed) and debounce on the client.

## Fragile Areas

**Uncommitted Money Plan feature spans backend, migrations and web:**
- Files: `apps/api/app/engine/money_plan.py`, `apps/api/app/services/money_plan.py`, `apps/api/migrations/versions/0006_goal_start_and_one_time_income.py`, `apps/api/migrations/versions/0007_money_plans.py`, `apps/web/src/app/(app)/plan/money/page.tsx`, plus 27 modified tracked files (safe-to-spend, forecast, check, goals, recurring, assistant tools, web pages) and a staged deletion of `apps/web/src/components/tools/planner.tsx`.
- Why fragile: Safe to Spend, Faldo Check, forecast, the assistant tools (`apps/api/app/ai/tools/definitions.py`) and the local provider all now consume `PlanWeek`/`plan_week()`; a partial commit would break migrations (`0007` depends on `0006`) or import errors (`apps/api/app/models/__init__.py` imports `MoneyPlan`).
- Safe modification: Commit backend + migrations + web together; run `uv run alembic upgrade head`, `pytest`, `npx tsc --noEmit` before committing.
- Test coverage: `apps/api/tests/test_money_plan.py` and `test_income_and_forecast_inputs.py` exist (untracked); no frontend tests.

**Financial arithmetic mixes `Decimal` averages with day-count constants:**
- Files: `apps/api/app/engine/money_plan.py` (`DAYS_PER_MONTH = 30.4375`, `PERIOD_DAYS`, `floor_unit`), `apps/api/app/engine/planning.py`, `apps/api/app/engine/safe_to_spend.py`
- Why fragile: Amounts are integer minor units (good), but per-period conversions floor to whole currency units and use average month lengths, so allocations can differ by a few units from exact calendar values; `allocate()` returns `float` percentages via `Decimal.quantize` conversion. Changes to rounding must be consistent across Safe to Spend, Money Plan and Check.
- Safe modification: Add tests in `apps/api/tests/test_engine.py` / `test_money_plan.py` before altering rounding or period constants.

**Numeric guardrail heuristics for assistant output:**
- Files: `apps/api/app/ai/guardrails/numeric.py`
- Why fragile: Regex-based matching of currency/percent tokens against tool-result numbers, with allowed sets built by treating every bare number as both money and percent. False negatives (unsupported figure passes) and false positives (valid figure flagged, causing `fallback` text) are both possible.
- Test coverage: `apps/api/tests/test_ai_guardrails.py`.

**Vector store mixes two embedding sources:**
- Files: `apps/api/app/models/ai.py` (`EMBEDDING_DIMENSIONS = 1536`), `apps/api/app/ai/providers/local_embeddings.py`, `apps/api/app/ai/providers/openai_provider.py`, `apps/api/app/ai/factory.py`
- Why fragile: The local hash embedding and OpenAI embeddings share one 1536-d column. Switching `AI_PROVIDER`/adding `OPENAI_API_KEY` leaves old vectors from the other provider in place; similarity search then compares incompatible spaces. `embedding_dimensions` in settings is configurable but the DB column is fixed at 1536.
- Safe modification: Store the embedding model name per row and re-index (enqueue `index_entity` jobs) on provider change.

**Receipt pipeline dependence on model output shape:**
- Files: `apps/api/app/services/receipts.py` (`validate_extraction`), `apps/api/app/ai/schemas.py`
- Why fragile: `item["amount"] >= 0` and `Decimal(str(raw["total"]))` assume numeric JSON; a non-numeric value from the model raises inside the job (retried up to `MAX_ATTEMPTS=4`, then `failed`). Tolerance constants are hard-coded for PHP centavos (`tolerance = 100`, currency check accepts `₱`/`PESO`/`PHP`).
- Safe modification: Wrap coercion in try/except returning an issue; make tolerance currency-aware.

## Scaling Limits

**Database connection pool:**
- Current capacity: `pool_size=10` (default `queue` pool) in `apps/api/app/core/db.py`; `NullPool` on Vercel (one connection per invocation).
- Limit: Long-lived assistant streams (see Tech Debt) and the in-API worker loop (`run_worker_in_api` in `apps/api/app/main.py` lifespan) compete for the same pool.
- Scaling path: Use PgBouncer (`DB_PGBOUNCER=true` is supported), separate the worker process (`apps/api/app/worker.py`), keep `RUN_WORKER_IN_API=false` outside dev.

**Receipts stored in Postgres on serverless:**
- Current capacity: Up to 8 MB upload, re-encoded to JPEG (max 2400px) and stored in `stored_files.content` when `STORAGE_BACKEND=database` (`apps/api/app/storage/files.py`); 40 uploads/user/day.
- Limit: Database size and backup cost grow with receipts; images are returned through the API (`GET /receipts/{id}/image`) with `Cache-Control: private, max-age=300`.
- Scaling path: Add an S3/Blob `ObjectStorage` implementation (the `ObjectStorage` Protocol already exists).

**Single-daily cron for jobs on Vercel:**
- Current capacity: `apps/api/vercel.json` schedules `/api/v1/internal/jobs/run` at `0 3 * * *`.
- Limit: Retry backoff (`5 * 2 ** attempts` seconds) can only be honoured at the next inline drain or daily cron; failed jobs may wait up to a day for a user who makes no writes.

## Dependencies at Risk

**Aggressively new/loose version constraints:**
- Risk: `apps/api/pyproject.toml` uses open lower bounds (`fastapi>=0.141`, `openai>=3.13`, `pillow>=12.3`, `ruff>=0.16`) and `apps/web/package.json` uses caret ranges with very recent majors (`next 16.3.5`, `react 19.2.8`, `lucide-react ^1.45.0`, `react-day-picker ^10`). Lockfiles (`apps/api/uv.lock`, `apps/web/package-lock.json`) pin actual versions and CI uses `uv sync --frozen`/`npm ci`.
- Impact: Upgrades via lockfile refresh can break the OpenAI provider (`apps/api/app/ai/providers/openai_provider.py`) or shadcn-generated components in `apps/web/src/components/ui/`.
- Migration plan: Upgrade dependencies deliberately, one group at a time, with CI green.

**`mypy` runs with `ignore_missing_imports = true`:**
- Impact: Untyped third-party APIs (e.g. `pgvector`, `argon2`) are not type-checked; SQLAlchemy `# type: ignore[attr-defined]` appears in `apps/api/app/services/common.py` (`get_owned`) and `apps/api/app/api/v1/auth.py` (`result.rowcount`).

## Missing Critical Features

**No frontend automated tests:**
- Problem: `apps/web` has no test runner, no test files, and CI (`.github/workflows/ci.yml`) only runs `npm run lint`, `tsc --noEmit` and `npm run build`.
- Blocks: Safe refactors of money formatting (`apps/web/src/lib/format.ts`), calculator logic (`apps/web/src/lib/calculator.ts`), and the SSE parser in `apps/web/src/lib/api.ts` (`streamPost`, which does an unguarded `JSON.parse`).

**No error tracking or metrics:**
- Problem: Logging goes to stdout via `apps/api/app/core/logging.py` only; no Sentry-style capture, no request IDs, no job-failure alerting (failed jobs only store `last_error` truncated to 500 chars).
- Blocks: Diagnosing production failures, especially silent job failures.

**No account-level email verification or MFA:**
- Problem: Registration in `apps/api/app/api/v1/auth.py` creates an active session immediately without verifying the email; there is no 2FA. Password reset relies entirely on email ownership.
- Blocks: Trust in reset flows for a financial app.

**Export omits parts of user data:**
- Problem: `GET /me/export` includes accounts, transactions, budgets, goals, recurring payments, debts and notes, but not `money_plans`, `planned_purchases`, receipts/images, AI conversations, streaks/engagement, or user settings.
- Blocks: Data-portability completeness; add new tables to the payload in `apps/api/app/api/v1/auth.py` when they are created.

## Test Coverage Gaps

**Frontend (all of `apps/web/src`):**
- What's not tested: Everything, including complex client components such as `apps/web/src/components/capture/keypad-entry.tsx` (402 lines), `apps/web/src/app/(app)/assistant/page.tsx` (469 lines) and `apps/web/src/app/onboarding/page.tsx` (361 lines).
- Risk: Regressions in the money-entry UX go unnoticed.
- Priority: Medium.

**Backend gaps around operations:**
- What's not tested: Job reclaim/failure paths (`apps/api/app/jobs/worker.py`), the cron endpoint (`apps/api/app/api/v1/internal.py`), password-reset and session-revocation flows beyond `tests/test_platform.py` basics, the database rate limiter under concurrency, receipt extraction with malformed model output, and the OpenAI provider (tests use the local provider: `AI_PROVIDER=local` in `apps/api/tests/conftest.py`).
- Files: `apps/api/tests/` (11 test modules, ~1,840 lines total against ~11,600 lines of app code)
- Risk: Production-only paths (OpenAI, `job_mode=inline`, `storage_backend=database`, `rate_limit_backend=database`) are exercised only in deployment because tests run on local defaults.
- Priority: High for jobs and OpenAI-provider contract tests.

**RLS enforcement is only tested indirectly:**
- What's not tested: `apps/api/tests/test_api.py::test_cross_tenant_isolation` checks 404s through the API, but service-layer `user_id` filters could mask a missing/incorrect RLS policy on new tables.
- Risk: A new table created without `FORCE ROW LEVEL SECURITY` would pass tests.
- Priority: Medium; add a test that enumerates `pg_class.relrowsecurity/relforcerowsecurity` for all tables with a `user_id` column.

---

*Concerns audit: 2026-09-21*
