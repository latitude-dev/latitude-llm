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

if [ -z "${CLICKHOUSE_URL+x}" ]; then
  echo "Error: CLICKHOUSE_URL must be declared"
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

CLICKHOUSE_URL="${CLICKHOUSE_URL}"
CLICKHOUSE_USER="${CLICKHOUSE_USER}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD}"
CLICKHOUSE_DB="${CLICKHOUSE_DB}"

if [ "${CLICKHOUSE_CLUSTER_ENABLED:-false}" = "true" ]; then
  MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/clustered"
  MODE="clustered"
else
  MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/unclustered"
  MODE="unclustered"
fi

CURRENT_VERSION=$(
  curl -s "${CLICKHOUSE_URL}/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}" \
    --data "SELECT version FROM schema_migrations ORDER BY sequence DESC LIMIT 1" 2>/dev/null | tr -d '[:space:]'
)

if [ -z "$CURRENT_VERSION" ] || [ "$CURRENT_VERSION" = "-1" ]; then
  CURRENT_VERSION="0"
fi

echo ""
echo "ClickHouse Migrations Status"
echo "============================"
echo "Mode: $MODE"
echo "Database: $CLICKHOUSE_DB"
echo "Current version: $CURRENT_VERSION"
echo ""
echo "Migrations:"

for f in $(ls "$MIGRATIONS_DIR"/*.up.sql 2>/dev/null | sort); do
  filename=$(basename "$f")
  version=$(echo "$filename" | sed 's/_.*//' | sed 's/^0*//')
  name=$(echo "$filename" | sed 's/^[0-9]*_//' | sed 's/\.up\.sql$//')

  if [ -z "$version" ]; then
    version="0"
  fi

  if [ "$version" -le "$CURRENT_VERSION" ] 2>/dev/null; then
    status="applied"
  else
    status="pending"
  fi

  echo "- $version $name ($status)"
done
