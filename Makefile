.PHONY: backend-install backend-run backend-test backend-lint mobile-install mobile-run mobile-check mobile-web infra-config infra-up infra-down migrate seed

backend-install:
	cd backend && uv sync --all-groups

backend-run:
	cd backend && uv run uvicorn app.main:app --reload

backend-test:
	cd backend && uv run pytest

backend-lint:
	cd backend && uv run ruff check app tests migrations && uv run mypy app

mobile-install:
	cd mobile && npm install

mobile-run:
	cd mobile && npm run start

mobile-check:
	cd mobile && npm run test && npm run typecheck && npm run lint

mobile-web:
	cd mobile && npm run web:build

infra-config:
	docker compose --env-file infra/.env -f infra/docker-compose.yml config --quiet

infra-up:
	docker compose --env-file infra/.env -f infra/docker-compose.yml up --build -d

infra-down:
	docker compose --env-file infra/.env -f infra/docker-compose.yml down

migrate:
	cd backend && uv run alembic upgrade head

seed:
	cd backend && uv run python -m app.cli seed-demo
