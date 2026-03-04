#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"

echo "Stopping and removing postgres container..."
docker compose rm -fs postgres

echo "Removing postgres volume..."
docker volume rm data-llm_postgres_data

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
