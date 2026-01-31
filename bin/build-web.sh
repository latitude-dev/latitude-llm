#!/bin/bash
#
# Build the web app locally with production settings.
#
# This script mimics the Docker build process (apps/web/docker/Dockerfile)
# for local testing and source map verification.
#
# Usage:
#   ./bin/build-web.sh
#
# What it does:
#   1. Loads environment variables from .env.example, .env, and .env.local
#   2. Sets BUILDING_CONTAINER=true to match Docker build behavior
#   3. Runs turbo build for @latitude-data/web and its dependencies
#   4. Reports source map counts (client-side and server-side)
#   5. Shows sample source paths from generated source maps

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

load_env_file() {
  local file="$1"
  if [ -f "$file" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      # Skip empty lines and comments
      [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
      # Only process lines that look like VAR=value
      if [[ "$line" =~ ^[a-zA-Z_][a-zA-Z0-9_]*= ]]; then
        export "$line"
      fi
    done < "$file"
    echo "  ✓ Loaded $file"
  fi
}

echo "Loading environment variables..."

load_env_file ".env.example"
load_env_file ".env"
load_env_file ".env.local"

# Set build-specific variables
export BUILDING_CONTAINER=true
export NEXT_TELEMETRY_DISABLED=1

echo ""
echo "Building @latitude-data/web..."
echo ""

pnpm turbo build --filter="@latitude-data/web..."

echo ""
echo "Build complete. Checking source maps..."
echo ""

echo "=== Client-side source maps (.next/static) ==="
CLIENT_MAPS=$(find apps/web/.next/static -name "*.map" 2>/dev/null | wc -l | tr -d ' ')
echo "  Found: $CLIENT_MAPS files"

echo ""
echo "=== Server-side source maps (.next/server) ==="
SERVER_MAPS=$(find apps/web/.next/server -name "*.map" 2>/dev/null | wc -l | tr -d ' ')
echo "  Found: $SERVER_MAPS files"

if [ "$SERVER_MAPS" -gt 0 ]; then
  echo ""
  echo "=== Sample server source map paths ==="
  SAMPLE_MAP=$(find apps/web/.next/server -name "*.map" -type f | head -1)
  if [ -n "$SAMPLE_MAP" ]; then
    echo "  File: $SAMPLE_MAP"
    echo "  Sources (first 3):"
    cat "$SAMPLE_MAP" | jq -r '.sources[:3][]' 2>/dev/null | sed 's/^/    /'
  fi
fi
