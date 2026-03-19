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

goose -dir "$MIGRATIONS_DIR" clickhouse "$DBSTRING" up
