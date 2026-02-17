#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY_FILE="$CORE_DIR/clickhouse/migrations/registry.json"

if ! command -v migrate &> /dev/null
then
  echo "Error: golang-migrate is not installed or not in PATH."
  echo "Please install golang-migrate via 'brew install golang-migrate' to run this script."
  echo "Visit https://github.com/golang-migrate/migrate for more installation instructions."
  exit 1
fi

if [ -z "$1" ]; then
  echo "Error: Migration name is required."
  echo "Usage: pnpm ch:create <migration_name>"
  echo "Example: pnpm ch:create your_migration_name"
  exit 1
fi

MIGRATION_NAME="$1"

echo "Creating migration: $MIGRATION_NAME"
echo ""

echo "Unclustered migrations:"
migrate create -ext sql -dir "$CORE_DIR/clickhouse/migrations/unclustered" -seq -digits 4 "$MIGRATION_NAME"

echo ""
echo "Clustered migrations:"
migrate create -ext sql -dir "$CORE_DIR/clickhouse/migrations/clustered" -seq -digits 4 "$MIGRATION_NAME"

UNCLUSTERED_UP_FILE="$(ls -1 "$CORE_DIR/clickhouse/migrations/unclustered"/*_"$MIGRATION_NAME".up.sql | sort | tail -n 1)"
UNCLUSTERED_UP_FILENAME="${UNCLUSTERED_UP_FILE##*/}"
MIGRATION_NUMBER="${UNCLUSTERED_UP_FILENAME%%_*}"
node -e "const fs=require('fs'); const file=process.argv[1]; const number=process.argv[2]; const name=process.argv[3]; let data={migrations:{}}; if (fs.existsSync(file)) { data=JSON.parse(fs.readFileSync(file,'utf8')); if (!data.migrations || typeof data.migrations !== 'object') data.migrations = {}; } const existing=data.migrations[number]; if (existing && existing !== name) { console.error('Error: migration number ' + number + ' is already registered for \'' + existing + '\'.'); console.error('Choose a different migration number by rebasing on the latest main branch and recreating your migration.'); process.exit(1); } data.migrations[number]=name; fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');" "$REGISTRY_FILE" "$MIGRATION_NUMBER" "$MIGRATION_NAME"

echo ""
echo "Migration files created in both clustered/ and unclustered/ directories."
echo "Registered migration number: $MIGRATION_NUMBER"
echo ""
echo "Next steps:"
echo "  1. Write your unclustered SQL now (used in development)"
echo "  2. Write clustered SQL (ON CLUSTER, ReplicatedMergeTree) for production"
echo ""
echo "Note: Cluster mode is not yet supported in dev. Only unclustered migrations run for now."
