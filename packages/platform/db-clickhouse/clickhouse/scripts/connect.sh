#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT_DIR="$(cd "$CORE_DIR/../.." && pwd)"

_SAVED_DB="${LAT_CLICKHOUSE_DB:-}"
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  eval "$(grep -v '^#' "$ROOT_DIR/.env" | grep -E '^[A-Za-z_][A-Za-z_0-9]*=' | sed 's/[[:space:]]*#.*//')"
  set +a
fi
[ -n "$_SAVED_DB" ] && LAT_CLICKHOUSE_DB="$_SAVED_DB"

if [ -z "${LAT_CLICKHOUSE_DB}" ]; then
  export LAT_CLICKHOUSE_DB="latitude_development"
fi

if [ -z "${LAT_CLICKHOUSE_USER}" ]; then
  export LAT_CLICKHOUSE_USER="latitude"
fi

if [ -z "${LAT_CLICKHOUSE_PASSWORD}" ]; then
  export LAT_CLICKHOUSE_PASSWORD="secret"
fi

CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep clickhouse | head -1)

if [ -z "$CONTAINER_NAME" ]; then
  echo "Error: No ClickHouse container found running."
  echo "Make sure to start the docker-compose services first."
  exit 1
fi

docker exec -it "$CONTAINER_NAME" clickhouse-client \
  --user "$LAT_CLICKHOUSE_USER" \
  --password "$LAT_CLICKHOUSE_PASSWORD" \
  --database "$LAT_CLICKHOUSE_DB"
