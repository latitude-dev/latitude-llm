#!/bin/bash

set -euo pipefail

# Prevent gh and git from invoking a pager (less) on long output — otherwise
# `gh pr list` or `gh pr create` can drop the terminal into a `less` screen
# that traps keys other than `q`, making it confusing to dismiss.
export GH_PAGER=cat
export GIT_PAGER=cat

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

# Candidate main-only commits by SHA reachability. We verify each below by
# reverse-applying the commit's patch against an `origin/development`
# worktree — this is what `git rebase` uses to detect already-applied
# commits, and it catches squash-merged cherry-picks even when development
# has additional changes on the same files (which a per-file diff check
# would misreport as missing).
candidate_shas=$(git log \
  --format='%H' \
  --right-only \
  --invert-grep \
  --grep='^Deploy production' \
  --grep='^Release -' \
  origin/development...origin/main)

verify_worktree=$(mktemp -d -t release-verify.XXXXXX)
trap 'git worktree remove --force "$verify_worktree" >/dev/null 2>&1; rm -rf "$verify_worktree"' EXIT
git worktree add --detach --quiet "$verify_worktree" origin/development

main_only_commits=""
while IFS= read -r sha; do
  [ -z "$sha" ] && continue
  if git diff --binary "$sha^..$sha" | git -C "$verify_worktree" apply --check --reverse >/dev/null 2>&1; then
    continue
  fi
  main_only_commits+="$(git log -1 --format='%h %s' "$sha")"$'\n'
done <<<"$candidate_shas"

if [ -n "$main_only_commits" ]; then
  echo "main has non-release commits that development does not contain:"
  printf '%s' "$main_only_commits"
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
  --jq '[.[] | select(.headRefName | startswith("release/"))]' \
  </dev/null)

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

# The release snapshot has `origin/main` as its only parent but carries the
# tree of `origin/development` at release time. Development's individual
# commits never enter main's ancestry, so `origin/main..origin/development`
# would list every commit going back to the previous release, not just what
# is new in this one. Find the development commit whose tree matches
# `origin/main` (the last released state) and list from there.
main_tree=$(git rev-parse 'origin/main^{tree}')
# awk must read the full stream rather than `exit` on first match: an early
# exit closes stdin, `git log` gets SIGPIPE, and `set -o pipefail` would
# abort the script after the branch push but before `gh pr create`.
last_released_dev_sha=$(git log --format='%H %T' origin/development \
  | awk -v t="$main_tree" 'sha == "" && $2 == t { sha = $1 } END { print sha }')

if [ -z "$last_released_dev_sha" ]; then
  last_released_dev_sha=$(git merge-base origin/main origin/development)
fi

commits=$(git log --max-count=50 --pretty=format:'- %h %s' "${last_released_dev_sha}..origin/development")
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
  --body "$body" \
  </dev/null
