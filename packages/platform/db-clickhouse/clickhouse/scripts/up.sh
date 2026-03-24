#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT_DIR="$(cd "$PKG_DIR/../../.." && pwd)"
NODE_ENV="${NODE_ENV:-development}"
ENV_FILE="$ROOT_DIR/.env.${NODE_ENV}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [ -z "${CLICKHOUSE_MIGRATION_URL+x}" ]; then
  echo "Error: CLICKHOUSE_MIGRATION_URL must be declared"
  exit 1
fi
if [ -z "${CLICKHOUSE_USER+x}" ]; then
  echo "Error: CLICKHOUSE_USER must be declared"
  exit 1
fi
if [ -z "${CLICKHOUSE_PASSWORD+x}" ]; then
  echo "Error: CLICKHOUSE_PASSWORD must be declared"
  exit 1
fi
if [ -z "${CLICKHOUSE_DB+x}" ]; then
  echo "Error: CLICKHOUSE_DB must be declared"
  exit 1
fi

if ! command -v goose &>/dev/null; then
  echo "Error: goose is not installed or not in PATH."
  echo "Install with: brew install goose"
  exit 1
fi

# Strip scheme to get host:port
CH_HOST_PORT="${CLICKHOUSE_MIGRATION_URL#clickhouse://}"

# ClickHouse Cloud requires TLS on native protocol (port 9440)
# Add secure=true parameter for TLS connections
if [[ "$CH_HOST_PORT" == *":9440"* ]] || [[ "$CH_HOST_PORT" == *".clickhouse.cloud"* ]]; then
  DBSTRING="clickhouse://${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}@${CH_HOST_PORT}/${CLICKHOUSE_DB}?secure=true"
else
  DBSTRING="clickhouse://${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}@${CH_HOST_PORT}/${CLICKHOUSE_DB}"
fi

echo "Running ClickHouse migrations on database: ${CLICKHOUSE_DB}"

if [ "${CLICKHOUSE_CLUSTER_ENABLED:-false}" = "true" ]; then
  MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/clustered"
else
  MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/unclustered"
fi

MAX_RETRIES="${CLICKHOUSE_MIGRATION_MAX_RETRIES:-5}"
RETRY_DELAY_SECONDS="${CLICKHOUSE_MIGRATION_RETRY_DELAY_SECONDS:-5}"

attempt=1
while true; do
  set +e
  goose_output="$(goose -dir "$MIGRATIONS_DIR" clickhouse "$DBSTRING" up 2>&1)"
  goose_status=$?
  set -e

  if [ "$goose_status" -eq 0 ]; then
    echo "$goose_output"
    break
  fi

  echo "$goose_output" >&2

  is_retryable_replica_lag=false
  if [[ "$goose_output" == *"code: 517"* ]] || [[ "$goose_output" == *"Code: 517"* ]] || [[ "$goose_output" == *"doesn't catchup with latest ALTER query updates"* ]]; then
    is_retryable_replica_lag=true
  fi

  if [ "$attempt" -ge "$MAX_RETRIES" ] || [ "$is_retryable_replica_lag" != "true" ]; then
    echo "ClickHouse migrations failed after ${attempt} attempt(s)." >&2
    exit "$goose_status"
  fi

  echo "ClickHouse replica metadata lag detected (code 517)." >&2
  echo "Retrying migrations in ${RETRY_DELAY_SECONDS}s (attempt ${attempt}/${MAX_RETRIES})..." >&2
  sleep "$RETRY_DELAY_SECONDS"
  attempt=$((attempt + 1))
done
