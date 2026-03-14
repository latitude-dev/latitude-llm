#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
UNCLUSTERED_DIR="$PKG_DIR/clickhouse/migrations/unclustered"
CLUSTERED_DIR="$PKG_DIR/clickhouse/migrations/clustered"

if ! command -v goose &>/dev/null; then
  echo "Error: goose is not installed or not in PATH."
  echo "Install with: brew install goose"
  exit 1
fi

if [ -z "${1:-}" ]; then
  echo "Usage: pnpm ch:create <migration_name>"
  exit 1
fi

MIGRATION_NAME="$1"

goose -dir "$UNCLUSTERED_DIR" create "$MIGRATION_NAME" sql

# Get the created file name and copy it to clustered dir
CREATED_FILE="$(ls -1t "$UNCLUSTERED_DIR"/*.sql | head -n 1)"
CREATED_FILENAME="$(basename "$CREATED_FILE")"

cp "$CREATED_FILE" "$CLUSTERED_DIR/$CREATED_FILENAME"

echo ""
echo "Created migration: $CREATED_FILENAME"
echo "  unclustered: $UNCLUSTERED_DIR/$CREATED_FILENAME"
echo "  clustered:   $CLUSTERED_DIR/$CREATED_FILENAME"
echo ""
echo "Fill in both files:"
echo "  - unclustered: use standard table engines (e.g. ReplacingMergeTree)"
echo "  - clustered:   add ON CLUSTER default and use Replicated* engines"
