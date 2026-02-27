#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY_FILE="$PKG_DIR/clickhouse/migrations/registry.json"

if ! command -v migrate &>/dev/null; then
  echo "Error: golang-migrate is not installed or not in PATH."
  exit 1
fi

if [ -z "${1:-}" ]; then
  echo "Usage: pnpm ch:create <migration_name>"
  exit 1
fi

MIGRATION_NAME="$1"

migrate create -ext sql -dir "$PKG_DIR/clickhouse/migrations/unclustered" -seq -digits 4 "$MIGRATION_NAME"
migrate create -ext sql -dir "$PKG_DIR/clickhouse/migrations/clustered" -seq -digits 4 "$MIGRATION_NAME"

UNCLUSTERED_UP_FILE="$(ls -1 "$PKG_DIR/clickhouse/migrations/unclustered"/*_"$MIGRATION_NAME".up.sql | sort | tail -n 1)"
UNCLUSTERED_UP_FILENAME="${UNCLUSTERED_UP_FILE##*/}"
MIGRATION_NUMBER="${UNCLUSTERED_UP_FILENAME%%_*}"

node -e "const fs=require('fs'); const file=process.argv[1]; const number=process.argv[2]; const name=process.argv[3]; let data={migrations:{}}; if (fs.existsSync(file)) { data=JSON.parse(fs.readFileSync(file,'utf8')); if (!data.migrations || typeof data.migrations !== 'object') data.migrations = {}; } const existing=data.migrations[number]; if (existing && existing !== name) { console.error('Migration number collision for ' + number); process.exit(1); } data.migrations[number]=name; fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');" "$REGISTRY_FILE" "$MIGRATION_NUMBER" "$MIGRATION_NAME"

echo "Created ClickHouse migration $MIGRATION_NUMBER $MIGRATION_NAME"
