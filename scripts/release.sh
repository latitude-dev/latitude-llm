#!/bin/bash

set -euo pipefail

export GIT_PAGER=cat

usage() {
  cat <<EOF
Usage: $0 [version]

Tags the current commit for production and pushes the tag. Production deploys are
triggered by pushed vX.Y.Z tags.

If version is omitted, the script finds the latest vX.Y.Z tag and bumps to the
next minor version (vX.(Y+1).0). If no release tag exists yet, it starts at
v0.1.0.

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

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. Commit or stash them before preparing a release."
  exit 1
fi

echo "Fetching origin/development and tags..."
git fetch origin development --tags --quiet

target_sha=$(git rev-parse HEAD)
if ! git merge-base --is-ancestor "${target_sha}" origin/development; then
  echo "HEAD (${target_sha}) is not reachable from origin/development."
  echo "Merge/push the commit to development before tagging it for production."
  exit 1
fi

latest_tag=$(git tag --sort=-v:refname 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)

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
  existing_sha=$(git rev-list -n 1 "refs/tags/${version}")
  echo "Tag ${version} already exists at ${existing_sha}. Choose a new release version."
  exit 1
fi

echo "Tagging ${target_sha} as ${version}..."
git tag "${version}" "${target_sha}"
git push origin "refs/tags/${version}"

echo "Pushed ${version}. The production deploy workflow will deploy the tagged commit after validation."
