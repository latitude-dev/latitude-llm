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

MIGRATION_URL="${CLICKHOUSE_MIGRATION_URL}"
CLICKHOUSE_USER="${CLICKHOUSE_USER}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD}"
CLICKHOUSE_DB="${CLICKHOUSE_DB}"

if ! command -v migrate &>/dev/null; then
  echo "Error: golang-migrate is not installed or not in PATH."
  exit 1
fi

if [ "${CLICKHOUSE_CLUSTER_ENABLED:-false}" = "true" ]; then
  MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/clustered"
  CLUSTER_NAME="${CLICKHOUSE_CLUSTER_NAME:-default}"
  DATABASE_URL="${MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&x-cluster-name=${CLUSTER_NAME}&x-migrations-table-engine=ReplicatedMergeTree"
else
  MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/unclustered"
  DATABASE_URL="${MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&x-migrations-table-engine=MergeTree"
fi

migrate -source "file://$MIGRATIONS_DIR" -database "$DATABASE_URL" drop
