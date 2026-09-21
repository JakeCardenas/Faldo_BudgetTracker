# Faldo

Faldo is an AI-powered financial decision system for the Philippines. It follows one loop: **track → understand → forecast → decide → act**, and it is built to answer "What can I do with my money next?" before you spend. Track money across cash, banks, e-wallets and cards, see what is safe to spend, check a purchase before you buy it, and ask questions that get **grounded, calculated, cited** answers.

The core idea: the LLM never produces financial numbers. A deterministic engine calculates, a RAG layer retrieves context from the user's own records, and the LLM explains. Every figure in an AI answer is checked against tool results before the user sees it.

## Architecture

```
apps/web   Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Lucide · Recharts · TanStack Query
   │  /api/* rewrite (same-origin, httpOnly session cookie)
apps/api   FastAPI · SQLAlchemy 2 (async) · Alembic · Pydantic v2
   ├─ engine/       pure deterministic finance: money, periods, budgets, goals, forecast, scenarios, health, anomalies, calculator
   ├─ services/     domain logic shared by REST routes and AI tools
   ├─ ai/
   │   ├─ providers/   OpenAI (Responses API, function calling, structured outputs, embeddings, vision) and a local development provider
   │   ├─ tools/       strict-schema tool registry + 20 financial tools
   │   ├─ rag/         document renderers, indexer, hybrid retriever
   │   ├─ assistant/   tool loop, SSE streaming, validation, citations
   │   ├─ capture/     natural-language transaction parsing (rules + LLM)
   │   └─ guardrails/  numeric faithfulness checks, output sanitization
   ├─ jobs/         Postgres-backed job queue (FOR UPDATE SKIP LOCKED) + worker
   └─ seed/         consistent Philippine demo dataset
PostgreSQL 17 + pgvector + pg_trgm, row-level security
```

**Why not Prisma:** the backend is Python and owns all persistence. SQLAlchemy + Alembic keep one strongly typed source of truth; the frontend never touches the database.

## What's built

Faldo is designed like a native iOS app on phones (large collapsing titles, a floating tab bar for Home, Wallet, Plan and History, bottom sheets, and a round add button) and like a desktop companion app on larger screens (sidebar, multi-column home). It supports light and dark mode and can be installed from the browser (Add to Home Screen on iPhone, Install app on Android and desktop).

- **Home:** leads with **Safe to Spend** (the amount, what's left for this week, a per-day pace and a "Why this number?" breakdown), then only what needs attention (overdue bills, income that hasn't been recorded, money owed that's due, budgets at risk, a shortfall), upcoming commitments, recent activity, your money (spendable, net worth, money owed, next income), one insight, goals and shortcuts.
- **Logging sheet:** a calculator keypad (+ − × ÷ %), expense / income / transfer, notes, recent-expense templates, category chips that show budget progress, date shortcuts, account picker, keyboard support on desktop, and feedback with Undo after saving. "Type it out" and receipt scanning live in the same sheet.
- **Wallet:** net worth / assets / liabilities, insight and daily balance cards, accounts grouped by type with totals, colorful account cards with quick actions, press-and-hold to rearrange, grid and list views, and ready-made templates for common PH banks and e-wallets.
- **Plan:** Faldo Check, planned purchases, budgets, goals, bills and subscriptions, installments and loans (with payments left), money owed, income schedule and the cashflow forecast.
- **Faldo Check:** enter a price (and optionally what it is and its category) from Home, Plan or a shortcut. Faldo shows Safe to Spend before and after, this week's share before and after, the per-day pace left, budget impact, what's already set aside before your next income, and, when it goes past Safe to Spend, an estimated goal delay. It is pure arithmetic on your data; the decision stays yours. Save it for later or log it if you buy it.
- **Planned purchases:** things you intend to buy (price, link, category, priority, notes, target date) re-checked against Safe to Spend every time you look: fits now, fits but more than this week's share, or an estimated date based on your usual monthly surplus. An optional 24-hour pause is there if you want it. "I bought it" records the expense.
- **Streaks & rewards:** daily logging streak with monthly restores, streak and milestone badges, and unlockable mascot outfits and home backgrounds.
- **Learn:** ten short money lessons written for the Philippines, each with takeaways and a quick check; progress is saved to your account.
- **Tools:** split a bill (creates "owed to you" entries), loan and installment calculator with true yearly cost and one-tap tracking, PH income tax calculator, currency converter, emergency fund planner, 50/30/20 planner against real spending, and quick notes.
- **Talk to Faldo:** chat that logs plain-language entries straight away ("Paid 70 on the bus from Cash") with a Cancel button, answers questions with tools and calculations, and supports voice dictation where the browser allows it.
- **Auth:** email/password (argon2id), server-side sessions in an httpOnly SameSite=Lax cookie, CSRF header + Origin checks, login throttling, password reset by email, password change, and active-session management.
- **Transactions:** full CRUD, income/expense/transfer, merchant, category + subcategory, account, payment method, notes, tags, **item-level purchases**, search (merchant, items, notes, tags, categories), filters (type, account, category, tag, dates), sorting, infinite loading, detail sheet, and a queue for receipts awaiting review.
- **Natural-language entry:** "Bought Nike shoes for ₱4,500 yesterday", Taglish ("nag-grab 180 kanina"), multiple transactions per message. Drafts show a confirmation card; unclear accounts, categories, dates and possible duplicates are highlighted with one-tap fixes. Merchant categories are learned from history. When the built-in rules already understand every entry (amount, category, date, accounts), no paid AI call is made.
- **Receipt scanning:** upload/camera → EXIF-stripped re-encoded image → vision extraction (merchant, date, items, total) → validation (totals, dates, currency) → review form → transaction → RAG indexing. Without a vision provider the upload is stored and the UI honestly asks for manual entry.
- **Accounts:** cash, bank, e-wallet, credit card, savings, custom; computed balances, balance history, archive.
- **Budgets:** monthly category budgets, pacing vs month elapsed, projection, warnings, previous month and 3-month averages, 6-month history, copy previous month, "Explain with AI".
- **Goals:** target, current, target date, planned monthly contribution, required monthly savings, estimated completion; linked savings accounts use real balances.
- **Bills & recurring:** subscriptions, bills, rent, loans, income; mark paid (creates a transaction), skip, pause.
- **Money owed:** I owe / owed to me, partial repayments, due dates, status. When money actually moves (you lend from GCash, a friend pays you back into BPI) the movement is recorded against that account as its own type, so balances stay right without counting as income or spending. **Split a purchase** from its transaction: your share stays as spending and the other person's share becomes money owed, linked to the original purchase (deleting the record undoes the split). Paying back your share of something can optionally count as spending in a category.
- **Forecast:** Monte Carlo projection from scheduled events and weekday spending patterns, P10–P90 range, lowest point, safe-to-spend breakdown, assumptions.
- **What-if simulator:** one-off or repeating changes (every day, week or month): extra spending, extra income, earning less, saving more or less. Horizons from month end to 12 months, calculated breakdown with how many times each change happens, risk level with reasons, budget impact, savings at risk, goal delay, baseline vs scenario chart, and presets such as "₱200 a day on food" or "Save ₱2,000 every month".
- **Insights:** budget exceeded/at risk, category spending spikes, overall spending changes, unusual transactions (robust z-score), bill reminders, cash-flow warnings, goal progress, savings rate. Every insight stores the facts it came from.
- **Statistics:** spent / income / net flow / transaction tiles, expense distribution, net worth trend over 30 days to a year, cashflow forecast summary, printable income statement, monthly overview, income vs expenses (12 months), category breakdown and biggest changes, daily spending, top merchants, top purchase items, AI summary written from the page's figures, and a transparent financial health score.
- **AI Assistant:** dedicated page with conversations, live tool steps, streamed answers, calculation cards labelled "Calculated by Faldo", clickable transaction citations, sources, "How Faldo answered" tool trace, and follow-up suggestions.
- **Global search (⌘K / Ctrl K):** transactions, merchants, items, categories, goals, accounts and financial memory, plus quick actions.
- **Onboarding:** welcome, currency, first account, how money comes in (salary, allowance, freelance or business, or no income right now; only scheduled income gets a schedule), goal, budget, first transaction, assistant intro.
- **Settings:** preferences (timezone, pay frequency, buffer, default account), security (password, signed-in devices), AI memory notes, category editing and deletion, data export, account deletion.

## Safe to Spend

Safe to Spend is money you **already have** that isn't spoken for before your next income. It is calculated by `app/engine/safe_to_spend.py` from database facts only:

```
Safe to Spend = spendable balance (cash, e-wallets, banks marked spendable)
              − bills and subscriptions due before your next income (overdue ones included)
              − money you owe that's due in that window
              − planned goal savings for the month
              − credit card balance to pay
              − safety buffer
```

- **Expected income is never added.** It only sets how long the money has to last: the window ends the day before the next scheduled repeating income. Income that's overdue but not yet recorded isn't money yet.
- **No regular income** (students between allowances, freelancers, people between jobs): the window is a rolling 30 days.
- **This week:** the week runs Monday to Sunday, or starts again on the day money comes in, and is cut at the end of the window. Its share is the money at the start of the week spread across the days left, so spending this week lowers "left for this week" one for one.
- The breakdown lists every bill, debt and savings item behind the number, so you can see why it changed.

## Database

Money is stored as `BIGINT` minor units with a `currency CHAR(3)` column. User-owned tables carry `user_id` and are protected by Postgres **row-level security** (`FORCE ROW LEVEL SECURITY`, so policies also bind the table owner). Locally the app connects as `faldo_app` (no `BYPASSRLS`) and sets `app.user_id` per transaction.

| Table | Purpose |
|---|---|
| `users`, `user_settings`, `sessions` | identity, preferences (including theme, mascot outfit, home background, quick actions and completed lessons), hashed session tokens |
| `accounts` | manual accounts with opening balance and a user-defined sort order; balances are computed from transactions |
| `categories` | expense/income categories with subcategories (`parent_id`) |
| `merchants` | normalized merchants with learned default category |
| `transactions`, `transaction_items`, `tags`, `transaction_tags` | ledger with item-level detail |
| `budgets`, `budget_categories` | monthly budgets and category limits |
| `savings_goals`, `goal_contributions` | goals and contributions |
| `recurring_payments` | bills, subscriptions and expected income (with an anchor day so month-end dates don't drift) |
| `debts`, `debt_payments` | money owed; `debts.source_transaction_id` links a split to its purchase and `debt_payments.transaction_id` links a repayment to its account movement |
| `planned_purchases` | things the user plans to buy, with an optional pause (RLS protected) |
| `financial_notes` | user-authored context for the AI |
| `receipts` | uploaded receipts, extraction and validation issues |
| `ai_insights` | detected insights (facts + evidence) and cached pulse |
| `embeddings` | RAG memory documents with `vector(1536)` and generated `tsvector` |
| `ai_conversations`, `ai_messages` | assistant history with blocks, sources, tool calls and validation status |
| `jobs` | background job queue |
| `auth_tokens` | single-use, hashed password reset tokens |
| `stored_files` | receipt images when `STORAGE_BACKEND=database` (RLS protected) |
| `rate_limit_hits` | fixed-window counters when `RATE_LIMIT_BACKEND=database` |

Transactions have five types: `income`, `expense`, `transfer`, and `debt_in` / `debt_out` for money owed movements. The last two change account balances but never count as income or spending, and a constraint requires them to belong to a money owed record (`transactions.debt_id`). They can only be changed from Money owed.

Constraints enforce positive amounts, transfer destinations, distinct transfer accounts, linked money owed movements, valid currency codes and month-start budgets.

## RAG

- **Indexed documents:** transactions, individual purchase items, monthly summaries, budgets, goals, recurring payments, debts, notes and past insights. Documents are rendered by deterministic templates (no LLM), content-hashed, and embedded only when changed.
- **Indexing:** every write enqueues a job in the same database transaction; the worker renders, embeds and upserts. Deletes remove documents.
- **Retrieval:** hybrid search combining pgvector cosine similarity, Postgres full-text search (AND and prefix-OR queries) and trigram matching, merged with reciprocal rank fusion and a similarity threshold. Every query filters by `user_id` and runs under RLS. Metadata filters: entity type, date range, category, account.
- **Retrieve → resolve → compute:** retrieval returns candidate refs. The model (or the development planner) decides which candidates are relevant, then `sum_transactions` computes the exact total in SQL from those refs, counting single items (`i#` refs) or whole purchases (`t#` refs). Snippet amounts are never added up.
- **When RAG is not used:** balances, totals, category spending, budgets, goals, bills and forecasts come from structured tools.

## AI tools

`get_current_balance` (includes Safe to Spend and what's left this week), `get_monthly_income`, `get_monthly_expenses`, `get_category_spending`, `get_transactions`, `compare_spending`, `get_savings_summary`, `get_budget_status`, `get_goal_progress`, `get_upcoming_payments`, `get_recurring_payments`, `calculate_affordability` (Faldo Check plus a projected balance), `calculate_forecast`, `simulate_scenario` (one-off or repeating changes), `search_financial_memory`, `sum_transactions`, `calculate`, `get_financial_health`, `get_debts`, `get_insights`.

- Pydantic argument models are converted to strict JSON schemas (all fields required, nullable where optional, no `$ref`).
- `user_id` comes from the session, never from the model. Periods are resolved server-side in the user's timezone.
- Each tool runs in a savepoint; failures return safe error messages to the model.
- Tools return both formatted and minor-unit values, plus UI blocks (calculation, risk, forecast, comparison, breakdown, progress, transactions, list, bars, health).

**Guardrails:** every money amount and percentage in an answer must match a tool result or the user's message. On mismatch the model gets one repair turn; if it still fails, the answer falls back to the calculated cards only. Output is stripped of links, images and HTML; unknown citations are removed; investment and loan product advice triggers a professional-advice note. The system prompt treats tool content as data, forbids invented records, and requires estimates to be labelled.

**Providers:** `AI_PROVIDER=auto` uses OpenAI when `OPENAI_API_KEY` is set. Otherwise the **local development provider** runs: a rule-based planner that calls the same tools and writes templated answers from their results, hashed lexical embeddings for RAG, and no receipt vision. The UI labels this mode.

## Environment variables

### API (`apps/api`)

| Variable | Local default | On Vercel | Notes |
|---|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://faldo_app:faldo_app@localhost:5432/faldo` | **required** | `postgres://…?sslmode=require` URLs are accepted |
| `MIGRATION_DATABASE_URL` | owner role on localhost | optional | defaults to `DATABASE_URL` |
| `DB_POOL` | `queue` | `null` | per-request connections on serverless |
| `DB_PGBOUNCER` | `false` | `true` if using a pooled URL | disables prepared-statement caching |
| `PUBLIC_APP_URL` | `http://localhost:3000` | **required** | web URL; used for reset links and added to allowed origins |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | optional | comma-separated extra origins |
| `COOKIE_SECURE` | `false` | `true` | |
| `AI_PROVIDER` | `auto` | `auto` | uses OpenAI when a key is present |
| `OPENAI_API_KEY` | — | recommended | server-side only |
| `OPENAI_CHAT_MODEL` / `OPENAI_FAST_MODEL` / `OPENAI_VISION_MODEL` / `OPENAI_EMBEDDING_MODEL` | `gpt-5-mini` / `gpt-5-nano` / `gpt-5-mini` / `text-embedding-3-small` | same | |
| `JOB_MODE` | `worker` | `inline` | inline processes queued jobs right after each write |
| `CRON_SECRET` | — | recommended | protects the daily job sweep |
| `STORAGE_BACKEND` | `local` | `database` | receipt images |
| `RATE_LIMIT_BACKEND` | `memory` | `database` | |
| `RESEND_API_KEY` / `EMAIL_FROM` | — | for password reset emails | without a key, reset links are only logged in development |
| `SEED_DEMO_PASSWORD` | `faldo-demo-2026` | — | |

Vercel defaults in the right column apply automatically when the `VERCEL` environment variable is present.

### Web (`apps/web`)

| Variable | Default | Notes |
|---|---|---|
| `API_ORIGIN` | `http://localhost:8000` | **required on Vercel**; the build fails without it |
| `NEXT_PUBLIC_SHOW_DEMO_LOGIN` | `true` locally | set `false` in production unless you seed a demo account |

## Run locally

### With Docker

```bash
cp .env.example .env
make up
```

Open http://localhost:3000 and choose **Explore the demo account** (`jake@faldo.app` / `faldo-demo-2026`).

### Without Docker

Requirements: Python 3.12 + [uv](https://docs.astral.sh/uv/), Node 24, PostgreSQL 17 with pgvector.

```bash
psql -d postgres -c "CREATE ROLE faldo LOGIN PASSWORD 'faldo' CREATEDB;"
psql -d postgres -c "CREATE ROLE faldo_app LOGIN PASSWORD 'faldo_app' NOSUPERUSER NOBYPASSRLS;"
psql -d postgres -c "CREATE DATABASE faldo OWNER faldo;"
psql -d faldo -c "CREATE EXTENSION vector; CREATE EXTENSION pg_trgm; CREATE EXTENSION citext;"

cd apps/api && uv sync && uv run alembic upgrade head && uv run python -m app.seed.demo
uv run uvicorn app.main:app --reload --port 8000

cd apps/web && cp .env.example .env.local && npm install && npm run dev
```

Tests use a `faldo_test` database created the same way (`ALEMBIC_DATABASE_URL=postgresql+asyncpg://faldo:faldo@localhost:5432/faldo_test uv run alembic upgrade head`).

## Deploy to Vercel

Faldo deploys as **two Vercel projects from the same GitHub repository** plus a Postgres database with pgvector (for example Neon from the Vercel Marketplace).

1. **Database.** Create a Postgres 17 database with the `vector`, `pg_trgm` and `citext` extensions available. Migrations create them if the role is allowed to.
2. **API project.**
   - Import the repository, set **Root Directory** to `apps/api`. Vercel detects FastAPI at `app/main.py`.
   - Environment variables: `DATABASE_URL`, `PUBLIC_APP_URL` (the web project's URL), `OPENAI_API_KEY`, `CRON_SECRET`, and optionally `RESEND_API_KEY` + `EMAIL_FROM`.
   - Each build runs `python -m app.deploy`, which applies Alembic migrations. Set `RUN_MIGRATIONS_ON_BUILD=false` to skip.
   - `vercel.json` sets a daily cron that sweeps queued jobs.
3. **Web project.**
   - Import the same repository, set **Root Directory** to `apps/web` (framework: Next.js).
   - Environment variables: `API_ORIGIN` = the API project's URL, `NEXT_PUBLIC_SHOW_DEMO_LOGIN=false`.
   - The web app rewrites `/api/*` to the API, so the session cookie stays on the web domain.
4. **Order.** Deploy the API first, copy its URL into the web project's `API_ORIGIN`, deploy the web project, then set the API's `PUBLIC_APP_URL` to the web URL and redeploy the API.
5. **Demo data (optional).** From your machine: `cd apps/api && DATABASE_URL="<production url>" uv run python -m app.seed.demo`.

Every user-owned table uses `FORCE ROW LEVEL SECURITY`, so policies apply to the table owner as well. Roles with the `BYPASSRLS` attribute skip policies entirely; on hosts whose default owner role has it (Neon's project owner does), run the app as a separate role created with `NOBYPASSRLS` and keep the owner for migrations. Check with `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user;`.

## Quality checks

```bash
make test        # 101 backend tests
make lint        # ruff + eslint
make typecheck   # mypy + tsc
make build       # Next.js production build
```

GitHub Actions (`.github/workflows/ci.yml`) runs migrations, ruff, mypy and pytest against pgvector Postgres, plus lint, type check and build for the web app.

The backend suite covers the finance engine (exact money math, periods, pacing, goals, recurring dates, deterministic forecasts, scenario arithmetic including repeating changes, Safe to Spend windows and the weekly share, Faldo Check verdicts, affordability estimates, safe calculator, health score), money owed movements and splits (balances, income and spending totals, locked movements, undoing a split), planned purchases, API behaviour (auth, CSRF, CRUD, balances across transfers and credit cards, validation, pagination), tenant isolation at the API and RLS layers, RAG indexing and cross-user retrieval isolation, natural-language parsing, every example assistant question, numeric repair and fallback, prompt-injection output handling, receipt handling without vision, OpenAI response mapping, password reset and session revocation, category deletion, the database rate limiter and storage, inline job processing, the cron secret, database URL normalization, streaks with restores, badge and reward unlocking, account ordering and balance history.

## Known limitations

- Streaks count days that have at least one transaction dated on them, so backdated entries also fill a day.
- Currency converter rates are editable references, not live market data.

- The OpenAI path is implemented against the Responses API and covered with mocked clients, but hasn't been run against a live key in this repository's tests. Model names are configurable.
- The development provider's answers are template-based; relevance judgement for semantic topics uses heuristics.
- Docker files are provided but were not run in the original development environment.
- On Vercel, queued work (embeddings, receipt reading) runs inline after writes; a failed job is retried by the daily cron or the next write.
- Receipt images are stored in Postgres on serverless deployments (8 MB cap per image).
- Single currency per user. No bank or e-wallet syncing, by design for this version.
- No email verification or MFA yet.
- Health score weights are a transparent heuristic, not a professional assessment.

## Next steps

1. Run the OpenAI provider against a live key and build an evaluation set (capture accuracy, retrieval recall, numeric faithfulness).
2. Email verification and passkeys.
3. Object storage for receipts, observability for tool traces and AI cost.
4. CSV import from bank and e-wallet statements.
5. Subscription detection from transaction history and payday-aware budgeting.
6. Reranking for memory search and user feedback on answers.
7. Playwright end-to-end and accessibility test suites.
