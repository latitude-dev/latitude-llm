#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT_DIR="$(cd "$CORE_DIR/../.." && pwd)"

_SAVED_CLUSTER_ENABLED="${CLICKHOUSE_CLUSTER_ENABLED:-}"
_SAVED_DB="${CLICKHOUSE_DB:-}"
[ -f "$ROOT_DIR/.env" ] && source "$ROOT_DIR/.env"
[ -n "$_SAVED_CLUSTER_ENABLED" ] && CLICKHOUSE_CLUSTER_ENABLED="$_SAVED_CLUSTER_ENABLED"
[ -n "$_SAVED_DB" ] && CLICKHOUSE_DB="$_SAVED_DB"

if [ -z "${CLICKHOUSE_URL}" ]; then
  echo "Error: CLICKHOUSE_URL is not configured."
  exit 1
fi

if [ -z "${CLICKHOUSE_DB}" ]; then
  export CLICKHOUSE_DB="latitude_analytics_development"
fi

if [ -z "${CLICKHOUSE_USER}" ]; then
  export CLICKHOUSE_USER="latitude"
fi

if [ -z "${CLICKHOUSE_PASSWORD}" ]; then
  export CLICKHOUSE_PASSWORD="secret"
fi

if [ "$CLICKHOUSE_CLUSTER_ENABLED" == "true" ]; then
  echo "Error: Cluster mode is not yet supported."
  echo "ClickHouse cluster infrastructure is under development."
  echo "Please set CLICKHOUSE_CLUSTER_ENABLED=false or leave it unset."
  exit 1
fi

MIGRATIONS_DIR="$CORE_DIR/clickhouse/migrations/unclustered"
MODE="unclustered"

CURRENT_VERSION=$(curl -s "${CLICKHOUSE_URL}/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}" \
  --data "SELECT version FROM schema_migrations ORDER BY sequence DESC LIMIT 1" 2>/dev/null | tr -d '[:space:]')

DIRTY=$(curl -s "${CLICKHOUSE_URL}/?user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}" \
  --data "SELECT dirty FROM schema_migrations ORDER BY sequence DESC LIMIT 1" 2>/dev/null | tr -d '[:space:]')

if [ -z "$CURRENT_VERSION" ] || [ "$CURRENT_VERSION" = "-1" ]; then
  CURRENT_VERSION="0"
fi

if [ "$DIRTY" = "1" ]; then
  DIRTY_STATUS="YES (needs manual fix)"
else
  DIRTY_STATUS="no"
fi

echo ""
echo "ClickHouse Migrations Status"
echo "============================"
echo ""
echo "Mode:            $MODE"
echo "Database:        $CLICKHOUSE_DB"
echo "Current version: $CURRENT_VERSION"
echo "Dirty:           $DIRTY_STATUS"
echo ""
echo "Migrations:"
echo "-----------"
printf "%-8s %-40s %s\n" "VERSION" "NAME" "STATUS"
printf "%-8s %-40s %s\n" "-------" "----" "------"

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
  
  printf "%-8s %-40s %s\n" "$version" "$name" "$status"
done

echo ""
