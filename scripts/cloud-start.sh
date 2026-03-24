#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

info() {
  echo "[cloud-start] $*"
}

warn() {
  echo "[cloud-start] WARNING: $*" >&2
}

did_pg_reset=0
did_ch_reset=0

is_docker_ready() {
  docker info >/dev/null 2>&1
}

start_docker_daemon() {
  if is_docker_ready; then
    info "Docker daemon is already available."
    return
  fi

  info "Starting Docker daemon via service..."
  if ! sudo service docker start >/dev/null 2>&1; then
    warn "service docker start did not succeed, attempting dockerd fallback."
  fi

  if ! is_docker_ready; then
    info "Starting dockerd fallback process..."
    sudo nohup dockerd >/tmp/dockerd.log 2>&1 &
  fi

  local retries=30
  local sleep_seconds=2
  local attempt
  for attempt in $(seq 1 "$retries"); do
    if is_docker_ready; then
      info "Docker daemon is ready."
      return
    fi

    sleep "$sleep_seconds"
  done

  echo "[cloud-start] ERROR: Docker daemon did not become ready." >&2
  exit 1
}

ensure_env_files() {
  if [ ! -f ".env.development" ]; then
    info "Creating .env.development from .env.example"
    cp ".env.example" ".env.development"
  fi

  if [ ! -f ".env.test" ]; then
    info "Creating .env.test from .env.example"
    cp ".env.example" ".env.test"
  fi

  # Keep old cloned env files compatible with current migration requirements.
  if ! rg -q "^LAT_ADMIN_DATABASE_URL=" ".env.development"; then
    info "Adding missing LAT_ADMIN_DATABASE_URL to .env.development"
    echo "LAT_ADMIN_DATABASE_URL=postgres://latitude:secret@localhost:5432/latitude_development" >> ".env.development"
  fi

  if ! rg -q "^LAT_MASTER_ENCRYPTION_KEY=" ".env.development"; then
    info "Adding default LAT_MASTER_ENCRYPTION_KEY to .env.development"
    echo "LAT_MASTER_ENCRYPTION_KEY=75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b" >> ".env.development"
  fi
}

load_development_env() {
  info "Loading environment variables from .env.development."
  set -a
  # shellcheck disable=SC1091
  source ".env.development"
  set +a
}

start_infra_services() {
  info "Starting infrastructure services for web auth+traces manual testing."
  NODE_ENV=development docker compose up -d \
    postgres \
    clickhouse \
    weaviate \
    redis \
    redis-bullmq \
    mailpit \
    temporal \
    temporal-ui
}

run_postgres_migrations() {
  if pnpm --filter @platform/db-postgres pg:migrate; then
    return
  fi

  if [ "${LAT_CLOUD_RESET_ON_MIGRATION_FAILURE:-1}" != "1" ]; then
    echo "[cloud-start] ERROR: Postgres migration failed and automatic reset is disabled." >&2
    exit 1
  fi

  warn "Postgres migration failed, running pg:reset to reconcile existing volume state."
  pnpm --filter @platform/db-postgres pg:reset
  did_pg_reset=1
}

run_clickhouse_migrations() {
  if pnpm --filter @platform/db-clickhouse ch:up; then
    return
  fi

  if [ "${LAT_CLOUD_RESET_ON_MIGRATION_FAILURE:-1}" != "1" ]; then
    echo "[cloud-start] ERROR: ClickHouse migration failed and automatic reset is disabled." >&2
    exit 1
  fi

  warn "ClickHouse migration failed, running ch:reset to reconcile existing volume state."
  pnpm --filter @platform/db-clickhouse ch:reset
  did_ch_reset=1
}

run_migrations() {
  info "Running database migrations."
  run_postgres_migrations
  run_clickhouse_migrations
  pnpm --filter @platform/db-weaviate wv:migrate
}

run_optional_seeds() {
  if [ "${LAT_CLOUD_SEED_DATABASES:-1}" = "1" ]; then
    info "Seeding Postgres and ClickHouse defaults (LAT_CLOUD_SEED_DATABASES=1)."

    if [ "$did_pg_reset" = "0" ]; then
      pnpm --filter @platform/db-postgres pg:seed
    else
      info "Skipping pg:seed because pg:reset already seeded Postgres."
    fi

    if [ "$did_ch_reset" = "0" ]; then
      pnpm --filter @platform/db-clickhouse ch:seed
    else
      info "Skipping ch:seed because ch:reset already seeded ClickHouse."
    fi

    return
  fi

  info "Skipping seeds because LAT_CLOUD_SEED_DATABASES is not 1."
}

main() {
  ensure_env_files
  load_development_env
  start_docker_daemon
  start_infra_services
  run_migrations
  run_optional_seeds
  info "Cloud startup prerequisites completed."
}

main "$@"
