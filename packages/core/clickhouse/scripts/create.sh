#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

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

echo ""
echo "Migration files created in both clustered/ and unclustered/ directories."
echo ""
echo "Next steps:"
echo "  1. Write your unclustered SQL now (used in development)"
echo "  2. Write clustered SQL (ON CLUSTER, ReplicatedMergeTree) for production"
echo ""
echo "Note: Cluster mode is not yet supported in dev. Only unclustered migrations run for now."
