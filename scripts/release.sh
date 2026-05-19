#!/bin/bash

set -euo pipefail

export GH_PAGER=cat
export GIT_PAGER=cat

usage() {
  cat <<EOF
Usage: $0 [version]

Creates a monorepo release PR against development. The PR updates the root
CHANGELOG.md with a monorepo release version. After the PR merges and staging
succeeds, the deploy workflow tags the merged commit with that version; the tag
push triggers production deployment.

This does not update npm/Python package versions or package changelogs; package
releases remain developer-managed.

If version is omitted, the script finds the latest vX.Y.Z tag merged into
development and bumps to the next minor version (vX.(Y+1).0). If no release tag
exists yet, it starts at v0.1.0.

Examples:
  $0
  $0 v1.2.3
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "$#" -gt 1 ]; then
  usage
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install: https://cli.github.com"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. Commit or stash them before preparing a release."
  exit 1
fi

echo "Fetching origin/development and tags..."
git fetch origin development --tags --quiet

latest_tag=$(git tag --merged origin/development --sort=-v:refname 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)

if [ "$#" -eq 1 ]; then
  version="$1"
else
  if [ -z "${latest_tag}" ]; then
    version="v0.1.0"
  else
    semver="${latest_tag#v}"
    IFS=. read -r major minor patch <<<"${semver}"
    version="v${major}.$((minor + 1)).0"
  fi
fi

if ! echo "${version}" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Release version must look like v1.2.3. Got: ${version}"
  exit 1
fi

if git rev-parse --verify "refs/tags/${version}" >/dev/null 2>&1; then
  echo "Tag ${version} already exists. Choose a new release version."
  exit 1
fi

existing_pr=$(gh pr list \
  --base development \
  --state open \
  --limit 100 \
  --json number,headRefName,url \
  --jq '[.[] | select(.headRefName | startswith("release/"))]')

if [ "$(echo "${existing_pr}" | jq 'length')" -gt 0 ]; then
  url=$(echo "${existing_pr}" | jq -r '.[0].url')
  branch=$(echo "${existing_pr}" | jq -r '.[0].headRefName')
  echo "A release PR is already open: ${url} (${branch})"
  echo "Merge or close it before opening a new one."
  exit 1
fi

if [ -n "${latest_tag}" ]; then
  range="${latest_tag}..origin/development"
else
  range="origin/development"
fi

commits=$(git log --max-count=100 --pretty=format:'- %h %s' "${range}")
if [ -z "${commits}" ]; then
  commits="- No code changes since ${latest_tag}."
fi

branch="release/${version}"
base_branch=$(git rev-parse --abbrev-ref HEAD)
cleanup() {
  git checkout "${base_branch}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git checkout -b "${branch}" origin/development

entry=$(mktemp -t release-entry.XXXXXX)
updated_changelog=$(mktemp -t release-changelog.XXXXXX)
trap 'rm -f "${entry}" "${updated_changelog}"; cleanup' EXIT

cat > "${entry}" <<EOF
## ${version}

${commits}

EOF

if [ -f CHANGELOG.md ]; then
  latest_changelog_version=$(grep -m1 -E '^## +\[?v[0-9]+\.[0-9]+\.[0-9]+\]?' CHANGELOG.md | sed -E 's/^## +\[?(v[0-9]+\.[0-9]+\.[0-9]+)\]?.*/\1/' || true)
  if [ "${latest_changelog_version}" = "${version}" ]; then
    echo "CHANGELOG.md already starts with ${version}."
    exit 1
  fi

  if [ "$(head -n 1 CHANGELOG.md)" = "# Changelog" ]; then
    {
      head -n 1 CHANGELOG.md
      echo ""
      cat "${entry}"
      tail -n +2 CHANGELOG.md
    } > "${updated_changelog}"
  else
    {
      echo "# Changelog"
      echo ""
      cat "${entry}"
      cat CHANGELOG.md
    } > "${updated_changelog}"
  fi
else
  {
    echo "# Changelog"
    echo ""
    cat "${entry}"
  } > "${updated_changelog}"
fi

cp "${updated_changelog}" CHANGELOG.md

git add CHANGELOG.md
git commit -m "Release ${version}"
git push origin "${branch}"

body=$(cat <<EOF
Prepares monorepo release \`${version}\`.

This PR updates the root \`CHANGELOG.md\`. After it is merged into \`development\` and the merged commit deploys successfully to staging, the deploy workflow will create tag \`${version}\`. That tag push triggers the production deployment for the tagged commit.

## Commits since ${latest_tag:-the beginning}

${commits}
EOF
)

gh pr create \
  --base development \
  --head "${branch}" \
  --title "Release ${version}" \
  --body "${body}"
