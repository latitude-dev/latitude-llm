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

if [ "${CLICKHOUSE_CLUSTER_ENABLED:-false}" = "true" ]; then
  MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/clustered"
  IS_CLUSTERED=true
else
  MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/unclustered"
  IS_CLUSTERED=false
fi

# Build connection query parameters used by goose.
DB_QUERY_PARAMS=()

# ClickHouse Cloud requires TLS on native protocol (port 9440).
if [[ "$CH_HOST_PORT" == *":9440"* ]] || [[ "$CH_HOST_PORT" == *".clickhouse.cloud"* ]]; then
  DB_QUERY_PARAMS+=("secure=true")
fi

# Clustered DDL should wait for replica metadata propagation.
if [ "$IS_CLUSTERED" = "true" ]; then
  DDL_ALTER_SYNC="${CLICKHOUSE_MIGRATION_ALTER_SYNC:-2}"
  DDL_TASK_TIMEOUT_SECONDS="${CLICKHOUSE_MIGRATION_DISTRIBUTED_DDL_TASK_TIMEOUT_SECONDS:-300}"
  DDL_INACTIVE_REPLICA_WAIT_SECONDS="${CLICKHOUSE_MIGRATION_REPLICA_WAIT_TIMEOUT_SECONDS:-300}"

  DB_QUERY_PARAMS+=("alter_sync=${DDL_ALTER_SYNC}")
  DB_QUERY_PARAMS+=("distributed_ddl_task_timeout=${DDL_TASK_TIMEOUT_SECONDS}")
  DB_QUERY_PARAMS+=("replication_wait_for_inactive_replica_timeout=${DDL_INACTIVE_REPLICA_WAIT_SECONDS}")
fi

DBSTRING="clickhouse://${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}@${CH_HOST_PORT}/${CLICKHOUSE_DB}"
if [ "${#DB_QUERY_PARAMS[@]}" -gt 0 ]; then
  DB_QUERY_STRING="$(IFS='&'; echo "${DB_QUERY_PARAMS[*]}")"
  DBSTRING="${DBSTRING}?${DB_QUERY_STRING}"
fi

echo "Running ClickHouse migrations on database: ${CLICKHOUSE_DB}"
if [ "$IS_CLUSTERED" = "true" ]; then
  echo "Clustered DDL settings: alter_sync=${DDL_ALTER_SYNC}, distributed_ddl_task_timeout=${DDL_TASK_TIMEOUT_SECONDS}, replication_wait_for_inactive_replica_timeout=${DDL_INACTIVE_REPLICA_WAIT_SECONDS}"
fi

MAX_RETRIES="${CLICKHOUSE_MIGRATION_MAX_RETRIES:-20}"
RETRY_DELAY_SECONDS="${CLICKHOUSE_MIGRATION_RETRY_DELAY_SECONDS:-5}"
MAX_RETRY_DELAY_SECONDS="${CLICKHOUSE_MIGRATION_MAX_RETRY_DELAY_SECONDS:-30}"
current_delay_seconds="$RETRY_DELAY_SECONDS"

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
    if [ "$is_retryable_replica_lag" = "true" ]; then
      echo "Hint: increase CLICKHOUSE_MIGRATION_MAX_RETRIES or CLICKHOUSE_MIGRATION_RETRY_DELAY_SECONDS for heavily loaded clusters." >&2
    fi
    exit "$goose_status"
  fi

  echo "ClickHouse replica metadata lag detected (code 517)." >&2
  echo "Retrying migrations in ${current_delay_seconds}s (attempt ${attempt}/${MAX_RETRIES})..." >&2
  sleep "$current_delay_seconds"
  if [ "$current_delay_seconds" -lt "$MAX_RETRY_DELAY_SECONDS" ]; then
    current_delay_seconds=$((current_delay_seconds * 2))
    if [ "$current_delay_seconds" -gt "$MAX_RETRY_DELAY_SECONDS" ]; then
      current_delay_seconds="$MAX_RETRY_DELAY_SECONDS"
    fi
  fi
  attempt=$((attempt + 1))
done
