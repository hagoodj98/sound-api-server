.PHONY: up down logs build rebuild migrate reset-db

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api

build:
	docker compose build

rebuild:
	docker compose build --no-cache

migrate:
	docker compose exec api npx prisma migrate deploy

reset-db:
	docker compose down -v
	docker compose up -d --build
	@echo "Waiting for db to be healthy..."
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' sound-api-db 2>/dev/null)" = "healthy" ]; do sleep 1; done
	docker compose exec api npx prisma migrate deploy
