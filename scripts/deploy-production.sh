#!/bin/bash

set -euo pipefail

WORKFLOW="create-deploy-pr.yml"

echo "Fetching latest branches from origin..."
git fetch origin main development

if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "origin/main was not found."
  exit 1
fi

if ! git rev-parse --verify origin/development >/dev/null 2>&1; then
  echo "origin/development was not found."
  echo "Create it first with: git push origin origin/main:refs/heads/development"
  exit 1
fi

release_commits=$(git rev-list --count origin/main..origin/development)

if [ "$release_commits" -eq 0 ]; then
  echo "No commits are waiting to be promoted from development to main."
  exit 0
fi

echo "Development is ahead of main by ${release_commits} commit(s)."
echo ""
echo "Commits waiting for production promotion:"
git log --oneline origin/main..origin/development
echo ""

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed; install it to trigger the deploy PR workflow from here."
  echo "Or trigger it manually: GitHub → Actions → Create Production Deploy PR → Run workflow."
  exit 1
fi

existing_pr=$(gh pr list \
  --base main \
  --state open \
  --limit 100 \
  --json number,headRefName,url \
  --jq '[.[] | select(.headRefName | startswith("deploy/production-"))]')

if [ "$(echo "$existing_pr" | jq 'length')" -gt 0 ]; then
  url=$(echo "$existing_pr" | jq -r '.[0].url')
  branch=$(echo "$existing_pr" | jq -r '.[0].headRefName')
  echo "A production deploy PR is already open: $url ($branch)"
  echo "Merge or close it before opening a new one."
  exit 1
fi

read -r -p "Trigger the Create Production Deploy PR workflow now? [y/N] " confirm
case "$confirm" in
  y | Y | yes | YES) ;;
  *)
    echo "Aborted."
    exit 0
    ;;
esac

echo "Triggering ${WORKFLOW}..."
gh workflow run "$WORKFLOW"

echo ""
echo "Waiting for the run to register..."
sleep 3
run_id=$(gh run list --workflow "$WORKFLOW" --limit 1 --json databaseId --jq '.[0].databaseId')

echo "Watching run ${run_id}..."
gh run watch "$run_id" --exit-status

echo ""
echo "Open production deploy PRs:"
gh pr list \
  --base main \
  --state open \
  --json number,headRefName,url \
  --jq '.[] | select(.headRefName | startswith("deploy/production-")) | "\(.url)  (\(.headRefName))"'
