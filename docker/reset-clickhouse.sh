#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"

if [ "${NODE_ENV:-}" = "production" ]; then
	echo "ERROR: reset script cannot run in production" >&2
	exit 1
fi

CLICKHOUSE_CONTAINER_ID="$(docker compose ps -q clickhouse || true)"
CLICKHOUSE_VOLUME_NAME=""

if [ -n "$CLICKHOUSE_CONTAINER_ID" ]; then
	CLICKHOUSE_VOLUME_NAME="$(docker inspect "$CLICKHOUSE_CONTAINER_ID" \
		--format '{{range .Mounts}}{{if eq .Destination "/var/lib/clickhouse"}}{{.Name}}{{end}}{{end}}')"
fi

echo "Stopping and removing clickhouse container..."
docker compose rm -fs clickhouse

echo "Removing clickhouse volume..."
if [ -z "$CLICKHOUSE_VOLUME_NAME" ]; then
	PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$REPO_ROOT")}"
	CLICKHOUSE_VOLUME_NAME="${PROJECT_NAME}_clickhouse_data"
fi

if docker volume inspect "$CLICKHOUSE_VOLUME_NAME" >/dev/null 2>&1; then
	docker volume rm "$CLICKHOUSE_VOLUME_NAME"
else
	echo "Volume '$CLICKHOUSE_VOLUME_NAME' not found, skipping"
fi

echo "Starting clickhouse..."
docker compose up -d clickhouse

echo "Waiting for clickhouse to be ready..."
until curl -sf "http://localhost:8123/ping" &>/dev/null; do
  sleep 1
done

echo "Running migrations..."
pnpm --filter @platform/db-clickhouse ch:up

echo "Seeding database..."
pnpm --filter @platform/db-clickhouse ch:seed

echo "Done."
