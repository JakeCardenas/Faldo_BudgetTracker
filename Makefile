.PHONY: up down migrate seed api worker web test lint typecheck build

up:
	docker compose up --build -d
	docker compose exec api alembic upgrade head
	docker compose exec api python -m app.seed.demo

down:
	docker compose down

migrate:
	cd apps/api && uv run alembic upgrade head

seed:
	cd apps/api && uv run python -m app.seed.demo

api:
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000

worker:
	cd apps/api && uv run python -m app.worker

web:
	cd apps/web && npm run dev

test:
	cd apps/api && uv run pytest -q
	cd apps/web && npm test

lint:
	cd apps/api && uv run ruff check app tests
	cd apps/web && npm run lint

typecheck:
	cd apps/api && uv run mypy app
	cd apps/web && npx tsc --noEmit

build:
	cd apps/web && npm run build
