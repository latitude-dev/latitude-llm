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

echo "Fixing migration sequence in unclustered/..."
goose -dir "$UNCLUSTERED_DIR" fix

echo "Fixing migration sequence in clustered/..."
goose -dir "$CLUSTERED_DIR" fix

echo "Done. Commit the renamed files."
