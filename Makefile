.PHONY: up down logs build rebuild migrate

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
