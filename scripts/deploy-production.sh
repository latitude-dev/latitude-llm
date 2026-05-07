#!/bin/bash

set -euo pipefail

WORKFLOW="create-deploy-pr.yml"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install: https://cli.github.com"
  exit 1
fi

echo "Triggering ${WORKFLOW}..."
gh workflow run "$WORKFLOW"

sleep 3
run_id=$(gh run list --workflow "$WORKFLOW" --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run_id" --exit-status
