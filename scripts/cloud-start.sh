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
    if rg -q "^LAT_API_KEY_ENCRYPTION_KEY=" ".env.development"; then
      local legacy_key
      legacy_key="$(rg -m 1 "^LAT_API_KEY_ENCRYPTION_KEY=" ".env.development")"
      legacy_key="${legacy_key#LAT_API_KEY_ENCRYPTION_KEY=}"
      info "Promoting LAT_API_KEY_ENCRYPTION_KEY to LAT_MASTER_ENCRYPTION_KEY in .env.development"
      echo "LAT_MASTER_ENCRYPTION_KEY=${legacy_key}" >> ".env.development"
    else
      info "Adding default LAT_MASTER_ENCRYPTION_KEY to .env.development"
      echo "LAT_MASTER_ENCRYPTION_KEY=75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b" >> ".env.development"
    fi
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

run_migrations() {
  info "Running database migrations."
  pnpm --filter @platform/db-postgres pg:migrate
  pnpm --filter @platform/db-clickhouse ch:up
  pnpm --filter @platform/db-weaviate wv:migrate
}

run_optional_seeds() {
  if [ "${LAT_CLOUD_SEED_DATABASES:-1}" = "1" ]; then
    info "Seeding Postgres and ClickHouse defaults (LAT_CLOUD_SEED_DATABASES=1)."
    pnpm --filter @platform/db-postgres pg:seed
    pnpm --filter @platform/db-clickhouse ch:seed
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
