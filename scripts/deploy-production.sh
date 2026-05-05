#!/bin/bash

set -euo pipefail

echo "Fetching latest branches from origin..."
git fetch origin main staging

if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "origin/main was not found."
  exit 1
fi

if ! git rev-parse --verify origin/staging >/dev/null 2>&1; then
  echo "origin/staging was not found."
  echo "Create it first with: git push origin origin/main:refs/heads/staging"
  exit 1
fi

release_commits=$(git rev-list --count origin/main..origin/staging)

if [ "$release_commits" -eq 0 ]; then
  echo "No commits are waiting to be promoted from staging to main."
  exit 0
fi

echo "Staging is ahead of main by ${release_commits} commit(s)."
echo ""
echo "Commits waiting for production promotion:"
git log --oneline origin/main..origin/staging
echo ""
echo "Production releases now happen by merging staging into main."
echo ""
echo "Recommended next steps:"
echo "  1. Open a PR from staging to main"
echo "  2. Review and merge it once checks pass"
echo "  3. Merging to main will trigger the production deploy workflow"
echo ""

if command -v gh >/dev/null 2>&1; then
  echo "Suggested PR command:"
  echo "  gh pr create --base main --head staging --fill"
else
  echo "GitHub CLI is not installed; open the compare view in GitHub instead."
fi
