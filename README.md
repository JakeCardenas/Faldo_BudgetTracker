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
   │   ├─ providers/   Claude (Messages API, streaming, tool use, prompt caching, vision), OpenAI (Responses API, streaming, embeddings) and a local development provider
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

Faldo is organised around four tabs: **Home** (today), **Wallet** (where your money lives), **Plan** (money ahead) and **History** (what happened). On phones they sit in a Threads-style liquid-glass capsule, icons only, with the **+** in the middle; scrolling down sinks it away and leaves a glass **+** in the corner, and scrolling up brings it back. A draggable **Faldo bubble** (a chat head) opens Talk to Faldo from anywhere. **Profile** (settings, lessons, streaks, tools and insights) opens from the avatar on Home. On desktop the same four tabs sit in a slim top bar, with search, notifications, Add and the avatar menu beside them. The design is calm and list-first: colour is kept for Safe to Spend and account cards, the glass material is only used for floating controls, and every number comes from the backend. It supports light and dark mode and can be installed from the browser (Add to Home Screen on iPhone, Install app on Android and desktop).

- **Home:** Faldo's green bamboo band with your streak, search, notifications and Profile, the greeting, and Faldo beside a speech bubble with the one thing worth knowing. Right under it, your total balance with a balance line (1W to 1Y; drag across it to read any day), then the quick actions as eight round buttons, **Safe to Spend** as a calm status (the amount, a per-day pace, what's left this week and a "Why this number?" sheet with the engine's calculation), a spending ring beside money in and out for today, this week or this month, payments due as compact rows (overdue bills can be marked paid in the row), account cards and recent activity.
- **Hide amounts:** an eye button on Home and Wallet (and a switch in Settings) shows every amount as ₱•••• on that device.
- **The + button:** type it like a text ("₱180 Jollibee lunch via GCash") and review the draft before it's saved, or pick Expense, Income or Transfer. The same menu scans a receipt, adds to a goal, records money owed, plans a purchase, checks a purchase and imports a statement.
- **Logging sheet:** a calculator keypad (+ − × ÷ %), expense / income / transfer, notes, recent-expense templates, category chips that show budget progress, date shortcuts, account picker, keyboard support on desktop, and feedback with Undo after saving. "Type it out" and receipt scanning live in the same sheet.
- **Adding an account:** a three-step vertical sheet: choose a type from a list (cash, e-wallet, bank, savings, debit card, credit card, something else), choose the bank or e-wallet from a searchable list, then name, balance, optional last four digits and colour with a live card preview. Known providers get a card face styled after their real card, with official logo files only (see `docs/DESIGN_SYSTEM.md`); no logo is drawn or generated.
- **Wallet:** a green band with your net worth (or assets or liabilities) beside Faldo, an insight and a seven-day balance chart, then your accounts grouped by type as two-column tiles (or a list) with totals. Reorder opens a simple list with up and down buttons. Tiles and cards use the provider's card style or the account's colour; savings and set-aside money get a lighter striped look so it doesn't read as spending money. Cards and bank accounts can show the last four digits if you add them, and nothing more: Faldo never asks for full card numbers, CVVs, PINs or banking passwords.
- **Plan:** every planning tool as a plain row (budgets, goals, money plan, bills, money owed, planned purchases, forecast), plus "Can I afford it?" (Faldo Check inline) and Statistics in the header.
- **History:** every transaction by day as flat rows, money in and out per day, search, sort and filters, and tabs for expenses, income and transfers, plus statistics and insights.
- **Profile:** your details, then streaks and rewards, insights, lessons, tools and settings. Settings is a short list of screens: appearance (theme, hide amounts, sounds, reduce motion, Faldo bubble), preferences, categories, Faldo's memory, password and devices, and your data.
- **Faldo Check ("Can I afford it?"):** enter a price (and optionally what it is and its category) from Home, Plan or the + menu. Faldo shows a verdict, Safe to Spend now and after, this week's share, the Money Plan bucket it comes from, budget impact, what's already set aside before your next income, and an estimated goal delay in days. It is pure arithmetic on your data; the decision stays yours. Save it for later or log it if you buy it.
- **Money Plan:** gives each payday's income a job: bills and commitments (from your bills, subscriptions and loans), needs, Joy Money (wants), savings and a buffer. Needs and wants follow your essential / non-essential categories, which you can switch from the same page. 60/20/20 is an optional starting point (20% savings, 20% Joy Money, needs are whatever of the 60% your bills leave). A live bar shows what's left unassigned, and warnings appear when bills are more than your income, you've assigned more than you earn, or savings are below what your goals need. Joy Money feeds the weekly figure on Home: "left for this week" is the smaller of Safe to Spend's weekly share and what's left of this week's Joy Money and needs. Faldo Check shows which bucket a purchase comes out of.
- **Planned purchases:** things you intend to buy (price, link, category, priority, notes, "want it by" date) re-checked against Safe to Spend every time you look: fits now, fits but more than this week's share, or an estimated date based on your usual monthly surplus. With a date, the purchase also appears on the cashflow forecast. An optional 24-hour pause is there if you want it. "I bought it" records the expense.
- **Streaks & rewards:** daily logging streak with monthly restores, streak and milestone badges, and unlockable Faldo poses and green Home environments, both shown on Home.
- **Learn:** ten short money lessons written for the Philippines, each with takeaways and a quick check; progress is saved to your account.
- **Tools:** split a bill (creates "owed to you" entries), loan and installment calculator with true yearly cost and one-tap tracking, PH income tax calculator, currency converter, emergency fund planner, a shortcut to the Money Plan, and quick notes.
- **Talk to Faldo:** chat that logs plain-language entries straight away ("Paid 70 on the bus from Cash") with a Cancel button, answers questions with tools and calculations, and supports voice dictation where the browser allows it.
- **Auth:** email/password (argon2id), server-side sessions in an httpOnly SameSite=Lax cookie, CSRF header + Origin checks, login throttling, password reset by email, password change, and active-session management.
- **Transactions:** full CRUD, income/expense/transfer, merchant, category + subcategory, account, payment method, notes, tags, **item-level purchases**, search (merchant, items, notes, tags, categories), filters (type, account, category, tag, dates), sorting, infinite loading, detail sheet, and a queue for receipts awaiting review.
- **Statement import:** upload a CSV exported from a bank or e-wallet into one of your accounts. Faldo finds the header row, the date, description and amount columns (or debit and credit, or a DR/CR column), the date order and the sign convention, then shows a review list before anything is saved. Rows already imported are skipped, rows that look like something you already logged are left unticked as possible duplicates, cash-ins and transfers that name another of your accounts become transfers instead of income or spending, and categories come from your learned merchants and the built-in rules. Each import can be undone as a whole from Recent imports. PDF statements need to be saved as CSV first.
- **Natural-language entry:** "Bought Nike shoes for ₱4,500 yesterday", Taglish ("nag-grab 180 kanina"), multiple transactions per message. Drafts show a confirmation card; unclear accounts, categories, dates and possible duplicates are highlighted with one-tap fixes. Merchant categories are learned from history. When the built-in rules already understand every entry (amount, category, date, accounts), no paid AI call is made.
- **Receipt scanning:** upload/camera → EXIF-stripped re-encoded image → vision extraction (merchant, date, items, total) → validation (totals, dates, currency) → review form → transaction → RAG indexing. Without a vision provider the upload is stored and the UI honestly asks for manual entry.
- **Account types:** cash, bank, e-wallet, credit card, savings, custom; computed balances, balance history, archive.
- **Budgets:** one summary (spent of budgeted, what's left, a month-elapsed mark) and a simple list of categories, "₱4,250 / ₱6,000" with one bar each and a warning when a category is on pace to go over. The 6-month history sits behind a disclosure; "Ask Faldo why" explains an overspend; copy last month's budget.
- **Goals:** a card per goal with saved of target, progress, target month, what's still needed, your planned monthly amount and what's needed each month, in plain words ("Behind pace. About ₱5,174 a month reaches it by Jul 2027."). Linked savings accounts use real balances. A starting amount counts toward progress but not as money saved this month. Reached goals get a small celebration from Faldo.
- **Bills & recurring:** subscriptions, bills, rent, loans, income; mark paid (creates a transaction), skip, pause. **One-time expected income** (a client payment, a bonus) is listed separately as expected, not received: it never counts toward Safe to Spend or sets its window, appears on the forecast as "may not arrive", and "Received" records it and closes it.
- **Money owed:** I owe / owed to me, partial repayments, due dates, status. When money actually moves (you lend from GCash, a friend pays you back into BPI) the movement is recorded against that account as its own type, so balances stay right without counting as income or spending. **Split a purchase** from its transaction: your share stays as spending and the other person's share becomes money owed, linked to the original purchase (deleting the record undoes the split). Paying back your share of something can optionally count as spending in a category.
- **Forecast:** one clearly labelled estimate (projected balance, likely range and lowest point), a restrained chart of actual versus projected, and a dated list of what's scheduled (bills, income, savings, one-time expected income and planned purchases with a date) plus estimated everyday spending. Built on a Monte Carlo projection from scheduled events and weekday spending patterns. The Safe to Spend breakdown and assumptions are one tap away.
- **What-if simulator:** one-off or repeating changes (every day, week or month): extra spending, extra income, earning less, saving more or less. Horizons from month end to 12 months, calculated breakdown with how many times each change happens, risk level with reasons, budget impact, savings at risk, goal delay, baseline vs scenario chart, and presets such as "₱200 a day on food" or "Save ₱2,000 every month".
- **Insights:** budget exceeded/at risk, category spending spikes, overall spending changes, unusual transactions (robust z-score), bill reminders, cash-flow warnings, goal progress, savings rate. Every insight stores the facts it came from.
- **Statistics:** each block answers one question. How much went out this month and how that compares with last month at the same point; where it went (ranked categories); what changed against the same days of last month; money in and out over 12 months; and where you spend most often. The printable income statement and the transparent financial health score sit behind disclosures, and a short summary is written from the page's own figures.
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

- **Expected income is never added.** It only sets how long the money has to last: the window ends the day before the next scheduled repeating income. Income that's overdue but not yet recorded isn't money yet. One-time expected income never sets the window.
- **No regular income** (students between allowances, freelancers, people between jobs): the window is a rolling 30 days.
- **This week:** the week runs Monday to Sunday, or starts again on the day money comes in, and is cut at the end of the window. Its share is the money at the start of the week spread across the days left, so spending this week lowers "left for this week" one for one. With a Money Plan, "left for this week" is capped by what's left of this week's Joy Money and needs, and the card says which limit applies.
- The breakdown lists every bill, debt and savings item behind the number, so you can see why it changed.

## Database

Money is stored as `BIGINT` minor units with a `currency CHAR(3)` column. User-owned tables carry `user_id` and are protected by Postgres **row-level security** (`FORCE ROW LEVEL SECURITY`, so policies also bind the table owner). Locally the app connects as `faldo_app` (no `BYPASSRLS`) and sets `app.user_id` per transaction.

| Table | Purpose |
|---|---|
| `users`, `user_settings`, `sessions` | identity, preferences (including theme, mascot outfit, home background, quick actions and completed lessons), hashed session tokens |
| `accounts` | manual accounts with opening balance, a user-defined sort order and optional last four digits (`card_last4`, four digits only); balances are computed from transactions |
| `categories` | expense/income categories with subcategories (`parent_id`) |
| `merchants` | normalized merchants with learned default category |
| `transactions`, `transaction_items`, `tags`, `transaction_tags` | ledger with item-level detail; imported rows keep `external_ref` (unique per account) and `import_batch_id` |
| `import_batches` | one per statement import, for the history and Undo (RLS protected) |
| `budgets`, `budget_categories` | monthly budgets and category limits |
| `savings_goals`, `goal_contributions` | goals and contributions (`is_initial` marks the starting amount) |
| `money_plans` | one per user: income per period, savings, Joy Money, buffer, optional fixed needs and the template used (RLS protected) |
| `recurring_payments` | bills, subscriptions and expected income, repeating or one-time (with an anchor day so month-end dates don't drift) |
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

`get_current_balance` (includes Safe to Spend and what's left this week), `get_monthly_income`, `get_monthly_expenses`, `get_category_spending`, `get_transactions`, `compare_spending`, `get_savings_summary`, `get_budget_status`, `get_goal_progress`, `plan_future_purchase` (savings prediction for something to buy later), `suggest_ideas` (gift and purchase ideas with rough price ranges, checked against the budget and Safe to Spend), `get_upcoming_payments`, `get_recurring_payments`, `get_money_plan`, `calculate_affordability` (Faldo Check plus a projected balance), `calculate_forecast`, `simulate_scenario` (one-off or repeating changes), `search_financial_memory`, `sum_transactions`, `calculate`, `get_financial_health`, `get_debts`, `get_insights`.

- Pydantic argument models are converted to strict JSON schemas (all fields required, nullable where optional, no `$ref`).
- `user_id` comes from the session, never from the model. Periods are resolved server-side in the user's timezone.
- Each tool runs in a savepoint; failures return safe error messages to the model.
- Tools return both formatted and minor-unit values, plus UI blocks (calculation, risk, forecast, comparison, breakdown, progress, transactions, list, bars, health).

**Guardrails:** every money amount and percentage in an answer must match a tool result or the user's message. On mismatch the model gets one repair turn; if it still fails, the answer falls back to the calculated cards only. Output is stripped of links, images and HTML; unknown citations are removed; investment and loan product advice triggers a professional-advice note. The system prompt treats tool content as data, forbids invented records, and requires estimates to be labelled.

**Providers:** `AI_PROVIDER=auto` uses **Claude** (`claude-sonnet-5` for answers and receipts, `claude-haiku-4-5` for quick capture and summaries) when `ANTHROPIC_API_KEY` is set, then OpenAI when `OPENAI_API_KEY` is set. Otherwise the **local development provider** runs: a rule-based planner that calls the same tools and writes templated answers from their results, hashed lexical embeddings for RAG, and no receipt vision. The UI labels this mode. Search embeddings come from OpenAI when its key is set (Anthropic has no embeddings) and from local hashing otherwise.

**Speed:** answers stream token by token from Claude or OpenAI, so the reply appears as it is written. Each question also carries a compact snapshot of the user's money (balances, Safe to Spend, this month's spending, budgets, what's due in 7 days, goals), so everyday questions need no tool round-trip; the snapshot counts as evidence for the numeric guardrail. Claude's tool definitions and system prompt are prompt-cached. If checking changes an answer that already streamed (a repaired figure, cleaned formatting, the advice note), the final version replaces it.

**Predictions:** plans to buy something later ("When can I afford a MacBook?", "plano ko bumili ng iPhone sa July 2028, magkano ipon ko?") are answered even without a goal. `plan_future_purchase` works out the months left, what to save each month and week (rounded up to whole pesos), the share of the usual monthly surplus (average over the last 3 full months) that takes, and when the user would have it at that pace. It uses the user's price, a matching goal's target and saved amount, or the model's labelled rough estimate. The rule-based fallback reads the same questions in English and Taglish and asks for the price when none is given.

**Ideas and conversation:** Faldo chats like a friend who is good with money (gifts, what to buy, money concepts in the Philippines), not only about the user's records. Suggestions go through `suggest_ideas`, so their price ranges pass the numeric guardrail and appear as a card where each idea can be planned (a planned purchase) or logged after buying (the expense form opens prefilled). Nothing is saved automatically, and chat never auto-logs a message that asks for something ("suggest…", "what can I buy…", "budget is…"); the capture parser refuses those too. The rule-based fallback suggests from a small catalogue of typical Philippine prices. When Claude refuses, the fallback answer shows why (no API credits, invalid key, busy) so it can be fixed.

**Free option (Gemini):** Faldo can run on Google Gemini's free tier. Create a key in Google AI Studio (no billing), set `GEMINI_API_KEY` and `AI_PROVIDER=gemini`. Gemini chats, reads photos (screenshots of shops included) and calls every Faldo tool; tool schemas are simplified for it and Gemini 3's thought signatures are sent back unchanged. The trade-off: on the free tier Google may use prompts and answers, which include the money snapshot, to improve its products, and people may review them. Claude or a paid Gemini key avoids that. Web search is Claude-only. When a provider refuses for a lasting reason (no credits, a bad key, a used-up free limit), it sits out for a while instead of failing every answer.

**Companion:** Faldo acts like a friend who keeps an eye on your money.

- **Actions, confirmed:** `propose_action` prepares a goal, a monthly budget, logged income or an expense, a planned purchase, a paid bill, a memory or a challenge as a card; only the user's tap calls the app's own endpoint (the card allows a fixed list of paths). Setting one budget keeps the others.
- **Memory:** lasting facts shared in chat (a birthday, allowance, family, plans) are offered as "Remember this?" and saved to Faldo's memory; saved notes are in every answer's context. They are never evidence for the numeric guardrail, so a note can't slip in a fake figure.
- **Recall:** after an answer is saved, the conversation gets a two or three sentence summary (Claude's fast model, or a plain extract in the fallback); the last five summaries go into later chats.
- **Check-ins:** `services/companion.py` ranks what's worth bringing up: money short, bills due or overdue (combined), budgets over or running low, payday, goals behind or reached, last week's spending, challenge progress, birthdays from memory, and Philippine moments (13th month, Christmas, Undas, back to school, Valentine's, Mother's and Father's Day, the new year). They open an empty chat as Faldo's messages, become personal chat starters, and feed the answer context.
- **Phone check-ins:** web push with a service worker (`public/sw.js`, no caching). The signing key is generated once and kept in `app_keys`. A daily cron (`/api/v1/internal/checkins/run`, 09:00 Manila) sends each subscribed user's most useful new check-in, at most one a day; gone subscriptions are removed. On iPhone it works in the app added to the Home Screen.
- **Challenges:** daily ipon, 52-week ipon, no-spend and spending cap, tracked from real records (ipon challenges save into their own goal). On the Streaks page and in chat (`get_challenges`, or started with `propose_action`).
- **Photos:** the chat takes a photo (downsized to about 1600px JPEG in the browser), which Claude reads; "can I afford this?" goes through `calculate_affordability` with the price it reads. The fallback says it can't see photos.
- **Web search:** Claude's own web search tool (up to three searches an answer, located in the Philippines). Quoted text from cited pages counts as evidence, and the pages show as links under the answer.

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
| `AI_PROVIDER` | `auto` | `auto` | `anthropic`, `gemini`, `openai` or `local`. A chosen provider is the only model used (the local rules step in when it can't answer); `auto` tries every provider with a key: Claude, then Gemini, then OpenAI |
| `ANTHROPIC_API_KEY` | — | recommended | server-side only; makes Claude the assistant |
| `ANTHROPIC_CHAT_MODEL` / `ANTHROPIC_FAST_MODEL` / `ANTHROPIC_VISION_MODEL` | `claude-sonnet-5` / `claude-haiku-4-5-20251001` / `claude-sonnet-5` | same | |
| `GEMINI_API_KEY` | — | optional | server-side only; Google Gemini through its OpenAI-compatible API. The free tier needs no billing, but Google may use free-tier prompts and answers to improve its products |
| `GEMINI_CHAT_MODEL` / `GEMINI_FAST_MODEL` | `gemini-flash-latest` / `gemini-3.5-flash-lite` | same | the fast model writes summaries, on its own free allowance |
| `OPENAI_API_KEY` | — | recommended | server-side only; the assistant when there is no Anthropic key, and search embeddings |
| `OPENAI_CHAT_MODEL` / `OPENAI_FAST_MODEL` / `OPENAI_VISION_MODEL` / `OPENAI_EMBEDDING_MODEL` | `gpt-5-mini` / `gpt-5-nano` / `gpt-5-mini` / `text-embedding-3-small` | same | |
| `JOB_MODE` | `worker` | `inline` | inline processes queued jobs right after each write |
| `CRON_SECRET` | — | recommended | protects the daily cron runs (job sweep and phone check-ins); without it they don't run |
| `AI_WEB_SEARCH` | `true` | `true` | lets Claude search the web for current prices, rates and news (Anthropic bills each search); if web search isn't enabled for the Anthropic organization, Faldo continues without it |
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
   - Environment variables: `DATABASE_URL`, `PUBLIC_APP_URL` (the web project's URL), `ANTHROPIC_API_KEY` (and `OPENAI_API_KEY` for search embeddings), `CRON_SECRET`, and optionally `RESEND_API_KEY` + `EMAIL_FROM`.
   - Each build runs `python -m app.deploy`, which applies Alembic migrations. Set `RUN_MIGRATIONS_ON_BUILD=false` to skip.
   - `vercel.json` sets a daily cron that sweeps queued jobs.
3. **Web project.**
   - Import the same repository, set **Root Directory** to `apps/web` (framework: Next.js).
   - Environment variables: `API_ORIGIN` = the API project's URL, `NEXT_PUBLIC_SHOW_DEMO_LOGIN=false`.
   - The web app rewrites `/api/*` to the API, so the session cookie stays on the web domain.
4. **Order.** Deploy the API first, copy its URL into the web project's `API_ORIGIN`, deploy the web project, then set the API's `PUBLIC_APP_URL` to the web URL and redeploy the API.
5. **Demo data (optional).** From your machine: `cd apps/api && DATABASE_URL="<production url>" uv run python -m app.seed.demo`.

Open copies of the web app keep themselves current: each build carries its commit (`VERCEL_GIT_COMMIT_SHA`), `/version` reports the live one, and when the app comes back to the front after a newer deploy it reloads (or, if a sheet is open or you are typing, loads the new version on your next page change). This matters most for Faldo added to an iPhone home screen, which resumes instead of reloading.

Every user-owned table uses `FORCE ROW LEVEL SECURITY`, so policies apply to the table owner as well. Roles with the `BYPASSRLS` attribute skip policies entirely; on hosts whose default owner role has it (Neon's project owner does), run the app as a separate role created with `NOBYPASSRLS` and keep the owner for migrations. Check with `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user;`.

## Quality checks

```bash
make test        # 175 backend tests
make lint        # ruff + eslint
make typecheck   # mypy + tsc
make build       # Next.js production build
```

GitHub Actions (`.github/workflows/ci.yml`) runs migrations, ruff, mypy and pytest against pgvector Postgres, plus lint, type check and build for the web app.

The backend suite covers the finance engine (exact money math, periods, pacing, goals, recurring dates, deterministic forecasts, scenario arithmetic including repeating changes, Safe to Spend windows and the weekly share, Faldo Check verdicts, affordability estimates, safe calculator, health score, Money Plan allocation and the 60/20/20 template, one-time income, planned purchases on the forecast, goal starting amounts), statement parsing (amount and date formats, e-wallet and bank layouts, stable row fingerprints) and import (duplicates, transfers, re-import, undo, isolation), money owed movements and splits (balances, income and spending totals, locked movements, undoing a split), planned purchases, API behaviour (auth, CSRF, CRUD, balances across transfers and credit cards, validation, pagination), tenant isolation at the API and RLS layers, RAG indexing and cross-user retrieval isolation, natural-language parsing, every example assistant question, numeric repair and fallback, prompt-injection output handling, receipt handling without vision, OpenAI response mapping, password reset and session revocation, category deletion, the database rate limiter and storage, inline job processing, the cron secret, database URL normalization, streaks with restores, badge and reward unlocking, account ordering and balance history, and the optional last four digits on accounts (four digits only).

## Known limitations

- Streaks count days that have at least one transaction dated on them, so backdated entries also fill a day.
- Currency converter rates are editable references, not live market data.

- The OpenAI path is implemented against the Responses API and covered with mocked clients, but hasn't been run against a live key in this repository's tests. Model names are configurable.
- The development provider's answers are template-based; relevance judgement for semantic topics uses heuristics.
- Docker files are provided but were not run in the original development environment.
- On Vercel, queued work (embeddings, receipt reading) runs inline after writes; a failed job is retried by the daily cron or the next write.
- Receipt images are stored in Postgres on serverless deployments (8 MB cap per image).
- Single currency per user. No live bank or e-wallet syncing yet; statements come in by CSV import.
- Statement import reads CSV only. When every date in a file works in both day-first and month-first order, month-first is assumed and the review screen offers to switch. When a file has only positive amounts and no debit/credit column, they're treated as spending, with a toggle to flip them.
- Money Plan follows your main repeating income. Without an income schedule (freelancers, students between allowances) it plans by calendar month from a typical monthly amount you enter.
- No email verification or MFA yet.
- Health score weights are a transparent heuristic, not a professional assessment.

## Next steps

1. Run the OpenAI provider against a live key and build an evaluation set (capture accuracy, retrieval recall, numeric faithfulness).
2. Email verification and passkeys.
3. Object storage for receipts, observability for tool traces and AI cost.
4. Bank connections, building on statement import: remembered column layouts per bank, PDF statements, then direct feeds where providers allow it.
5. Subscription detection from transaction history.
6. Reranking for memory search and user feedback on answers.
7. Playwright end-to-end and accessibility test suites.
