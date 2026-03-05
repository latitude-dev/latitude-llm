#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"

if [ "${NODE_ENV:-}" = "production" ]; then
	echo "ERROR: reset script cannot run in production" >&2
	exit 1
fi

POSTGRES_CONTAINER_ID="$(docker compose ps -q postgres || true)"
POSTGRES_VOLUME_NAME=""

if [ -n "$POSTGRES_CONTAINER_ID" ]; then
	POSTGRES_VOLUME_NAME="$(docker inspect "$POSTGRES_CONTAINER_ID" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"
fi

echo "Stopping and removing postgres container..."
docker compose rm -fs postgres

echo "Removing postgres volume..."
if [ -z "$POSTGRES_VOLUME_NAME" ]; then
	PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$REPO_ROOT")}"
	POSTGRES_VOLUME_NAME="${PROJECT_NAME}_postgres_data"
fi

if docker volume inspect "$POSTGRES_VOLUME_NAME" >/dev/null 2>&1; then
	docker volume rm "$POSTGRES_VOLUME_NAME"
else
	echo "Volume '$POSTGRES_VOLUME_NAME' not found, skipping"
fi

echo "Starting postgres..."
docker compose up -d postgres

echo "Waiting for postgres to be ready..."
until docker compose exec postgres pg_isready -U latitude -d latitude_development -q; do
	sleep 1
done

echo "Running migrations..."
pnpm --filter @platform/db-postgres pg:migrate

echo "Seeding database..."
pnpm --filter @platform/db-postgres pg:seed

echo "Done."
