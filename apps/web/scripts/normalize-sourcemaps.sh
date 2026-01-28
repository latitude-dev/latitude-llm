#!/bin/bash

# Script to normalize Turbopack sourcemap names for Datadog CI upload
# Turbopack generates sourcemaps with different content hashes than their JS files
# This script renames sourcemaps to match the JS file names (foo.js -> foo.js.map)

set -e

STATIC_DIR="${1:-.next/static}"

echo "Normalizing sourcemaps in $STATIC_DIR..."

# Counter for progress
total=0
renamed=0
skipped=0
missing=0

# Find all JS files and process them
while IFS= read -r -d '' jsfile; do
  total=$((total + 1))

  # Extract the sourceMappingURL from the end of the file
  ref=$(tail -c 200 "$jsfile" 2>/dev/null | grep -o "sourceMappingURL=[^[:space:]]*" | cut -d= -f2)

  if [ -z "$ref" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  # Get the directory and compute paths
  dir=$(dirname "$jsfile")
  expected_map="${jsfile}.map"
  actual_map="${dir}/${ref}"

  # Skip if already correctly named
  if [ "$actual_map" = "$expected_map" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  # Check if the referenced sourcemap exists
  if [ ! -f "$actual_map" ]; then
    echo "Warning: Referenced sourcemap not found: $actual_map (from $jsfile)"
    missing=$((missing + 1))
    continue
  fi

  # Rename the sourcemap to match the JS filename
  mv "$actual_map" "$expected_map"
  renamed=$((renamed + 1))

done < <(find "$STATIC_DIR" -name "*.js" -type f -print0)

echo "Sourcemap normalization complete:"
echo "  Total JS files processed: $total"
echo "  Sourcemaps renamed: $renamed"
echo "  Already correct/no sourcemap: $skipped"
echo "  Missing sourcemaps: $missing"

# Clean up orphaned sourcemaps (maps that no JS file references)
orphaned=0
while IFS= read -r -d '' mapfile; do
  jsfile="${mapfile%.map}"
  if [ ! -f "$jsfile" ]; then
    rm "$mapfile"
    orphaned=$((orphaned + 1))
  fi
done < <(find "$STATIC_DIR" -name "*.js.map" -type f -print0)

if [ "$orphaned" -gt 0 ]; then
  echo "  Orphaned sourcemaps removed: $orphaned"
fi
