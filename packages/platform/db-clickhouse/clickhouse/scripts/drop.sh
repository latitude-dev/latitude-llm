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

if [ -z "${LAT_CLICKHOUSE_MIGRATION_URL+x}" ]; then
	echo "Error: LAT_CLICKHOUSE_MIGRATION_URL must be declared"
	exit 1
fi
if [ -z "${LAT_CLICKHOUSE_USER+x}" ]; then
	echo "Error: LAT_CLICKHOUSE_USER must be declared"
	exit 1
fi
if [ -z "${LAT_CLICKHOUSE_PASSWORD+x}" ]; then
	echo "Error: LAT_CLICKHOUSE_PASSWORD must be declared"
	exit 1
fi
if [ -z "${LAT_CLICKHOUSE_DB+x}" ]; then
	echo "Error: LAT_CLICKHOUSE_DB must be declared"
	exit 1
fi

if ! command -v goose &>/dev/null; then
	echo "Error: goose is not installed or not in PATH."
	echo "Install with: brew install goose"
	exit 1
fi

# Strip scheme to get host:port
CH_HOST_PORT="${LAT_CLICKHOUSE_MIGRATION_URL#clickhouse://}"
DBSTRING="clickhouse://${LAT_CLICKHOUSE_USER}:${LAT_CLICKHOUSE_PASSWORD}@${CH_HOST_PORT}/${LAT_CLICKHOUSE_DB}"

if [ "${LAT_CLICKHOUSE_CLUSTER_ENABLED:-false}" = "true" ]; then
	MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/clustered"
else
	MIGRATIONS_DIR="$PKG_DIR/clickhouse/migrations/unclustered"
fi

goose -dir "$MIGRATIONS_DIR" clickhouse "$DBSTRING" reset
