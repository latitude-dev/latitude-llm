#!/bin/bash
set -e

CONFIG_FILE="eslint.config.mjs"
MISSING=()

# Find all TypeScript packages (those with tsconfig.json)
while IFS= read -r pkg; do
  # Check if this package has a files: pattern in eslint.config.mjs
  if ! grep -q "files: \['$pkg/" "$CONFIG_FILE"; then
    MISSING+=("$pkg")
  fi
done < <(find apps packages -name "tsconfig.json" -type f 2>/dev/null | xargs -I {} dirname {} | sort -u)

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ Missing ESLint configuration for the following packages:"
  for pkg in "${MISSING[@]}"; do
    echo "   - $pkg"
  done
  echo ""
  echo "ESLint 9 uses a centralized flat config. New packages must be"
  echo "explicitly added or they won't be linted."
  echo ""
  echo "Add a configuration block in: $CONFIG_FILE"
  exit 1
fi

echo "✅ All packages have ESLint configuration"
