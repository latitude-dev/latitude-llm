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

release_commits=$(git rev-list --count origin/main..origin/development)
if [ "$release_commits" -eq 0 ]; then
  echo "No commits to promote from development to main."
  exit 0
fi

echo "Development is ${release_commits} commit(s) ahead of main:"
git --no-pager log --oneline origin/main..origin/development
echo ""

main_commits_not_on_development=$(git cherry -v origin/development origin/main | awk '$1=="+"')
if [ -n "$main_commits_not_on_development" ]; then
  echo "Warning: main has commits whose changes are not on development:"
  printf '%s\n' "$main_commits_not_on_development" | sed 's/^+ /  /'
  echo ""
  echo "These will likely cause merge conflicts when promoting development → main."
  echo "Back-merge main into development first, or proceed and resolve conflicts in the PR."
  echo ""
  read -r -p "Continue anyway? [y/N] " continue_anyway
  case "$continue_anyway" in
  y | Y | yes | YES) ;;
  *)
    echo "Aborted."
    exit 0
    ;;
  esac
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

read -r -p "Open a production deploy PR now? [y/N] " confirm
case "$confirm" in
y | Y | yes | YES) ;;
*)
  echo "Aborted."
  exit 0
  ;;
esac

timestamp=$(TZ=Europe/Madrid date +%d-%m-%Y-%H-%M)
branch="deploy/production-${timestamp}"

echo "Creating branch ${branch} from origin/development..."
git push origin "origin/development:refs/heads/${branch}"

commits=$(git log --pretty=format:'- %h %s' origin/main..origin/development | head -50)
body=$(
  cat <<EOF
Promotes \`development\` to \`main\` to deploy to production.

## Commits

${commits}
EOF
)

gh pr create \
  --base main \
  --head "$branch" \
  --title "Deploy production — ${timestamp}" \
  --body "$body"
