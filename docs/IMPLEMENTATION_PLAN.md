# Faldo — Implementation Plan

## Repository state at start

The repository contained only `docs/FALDO_PRODUCT_SPEC.md`. This is a new project; nothing existing is replaced.

## Architecture decisions

| Area | Decision | Reason |
|---|---|---|
| Monorepo | `apps/web` (Next.js) + `apps/api` (FastAPI) + `infra/` + root `docker-compose.yml` | Two languages; no JS workspace tooling needed |
| Data layer | SQLAlchemy 2 (async, typed `Mapped[]`) + Alembic + Pydantic v2 | FastAPI owns all persistence. Prisma would create a second source of truth in a different runtime; the frontend never touches the database. End-to-end typing comes from Pydantic schemas mirrored in `apps/web/src/lib/api/types.ts`. |
| Auth | First-party server-side sessions in FastAPI, argon2id, httpOnly cookie; Next.js rewrites `/api/*` to FastAPI so cookies are first-party | Identity next to the data, revocable sessions, no tokens in JS |
| Tenant isolation | Repository-level `user_id` scoping **and** Postgres row-level security with an unprivileged `faldo_app` role (`SET LOCAL app.user_id` per transaction) | Defence in depth |
| Money | `BIGINT` minor units, `currency CHAR(3)` on monetary rows, PHP default | No floating-point errors |
| Deterministic engine | `app/engine/*` pure functions (periods, budgets, goals, forecast, affordability, scenarios, health, anomalies, calculator) | The LLM never computes financial numbers |
| AI providers | `LLMProvider` + `EmbeddingProvider` interfaces. `openai` implementation (Responses API, function calling, structured outputs, embeddings, vision). `local` development provider (rule-based planner over the same tools, hashed lexical embeddings, no receipt vision) | Runnable without a key, production path ready, dev mode clearly labelled |
| RAG | `memory_documents` with `vector(1536)` + generated `tsvector`; deterministic document templates; outbox jobs; hybrid retrieval (vector + full-text + trigram, reciprocal rank fusion); every query filtered by `user_id` and protected by RLS | Retrieval for fuzzy meaning; totals from SQL |
| Jobs | Postgres `jobs` table, `FOR UPDATE SKIP LOCKED`, worker loop runnable standalone or inside the API process | No Redis dependency; jobs enqueued in the same DB transaction as the write |
| Frontend | Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui, Lucide, Recharts, TanStack Query | Per brief |

## Phases

1. Repo scaffold, dependencies, env config, Docker Compose.
2. Models, Alembic migration (extensions, RLS, grants), seed data (consistent PH persona), auth.
3. Core API: accounts, categories, transactions (+ items, tags), budgets, goals, recurring, debts, notes.
4. Analytics: dashboard, reports, forecast, insights, financial health.
5. AI: providers, tool registry, RAG indexer/retriever, assistant with SSE, numeric validation.
6. Natural-language capture, what-if simulator, receipt pipeline.
7. Frontend polish: responsive shell, accessibility, loading/empty/error states, motion.
8. Tests (engine, API, tenant isolation, RAG scoping, AI tools), lint, type check, production build.

## Scope notes versus the earlier spec

The build brief explicitly requests reports, financial health, debts, and subcategories, so they are included even though the spec deferred them. Subcategories are modelled as child categories (`categories.parent_id`).
