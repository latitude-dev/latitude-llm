#!/bin/bash

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install: https://cli.github.com"
  exit 1
fi

echo "Fetching origin..."
git fetch origin main development

if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "origin/main was not found."
  exit 1
fi

if ! git rev-parse --verify origin/development >/dev/null 2>&1; then
  echo "origin/development was not found."
  exit 1
fi

if git diff --quiet origin/main..origin/development; then
  echo "No commits to promote from development to main."
  exit 0
fi

echo "Development differs from main:"
git diff --shortstat origin/main..origin/development
echo ""

main_only_commits=$(git log \
  --format='%h %s' \
  --right-only \
  --invert-grep \
  --grep='^Deploy production' \
  --grep='^Release -' \
  origin/development...origin/main)

if [ -n "$main_only_commits" ]; then
  echo "main has non-release commits that development does not contain:"
  printf '%s\n' "$main_only_commits"
  echo ""
  echo "Promoting development would remove these changes from production."
  echo "Cherry-pick or merge them into development first, then run this script again."
  exit 1
fi

existing_pr=$(gh pr list \
  --base main \
  --state open \
  --limit 100 \
  --json number,headRefName,url \
  --jq '[.[] | select(.headRefName | startswith("release/"))]')

if [ "$(echo "$existing_pr" | jq 'length')" -gt 0 ]; then
  url=$(echo "$existing_pr" | jq -r '.[0].url')
  branch=$(echo "$existing_pr" | jq -r '.[0].headRefName')
  echo "A release PR is already open: $url ($branch)"
  echo "Merge or close it before opening a new one."
  exit 1
fi

read -r -p "Open a release PR now? [y/N] " confirm
case "$confirm" in
y | Y | yes | YES) ;;
*)
  echo "Aborted."
  exit 0
  ;;
esac

timestamp=$(TZ=Europe/Madrid date +%d-%m-%Y-%H-%M)
branch="release/${timestamp}"

echo "Creating production snapshot ${branch} from origin/development with origin/main as parent..."
snapshot_commit=$(git commit-tree "$(git rev-parse 'origin/development^{tree}')" \
  -p origin/main \
  -m "Release - ${timestamp}")
git push origin "${snapshot_commit}:refs/heads/${branch}"

commits=$(git log --max-count=50 --pretty=format:'- %h %s' origin/main..origin/development)
body=$(
  cat <<EOF
Promotes \`development\` to \`main\` for a release.

## Commits

${commits}
EOF
)

gh pr create \
  --base main \
  --head "$branch" \
  --title "Release ${timestamp}" \
  --body "$body"
