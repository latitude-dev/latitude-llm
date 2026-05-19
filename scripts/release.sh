#!/bin/bash

set -euo pipefail

export GIT_PAGER=cat

usage() {
  cat <<EOF
Usage: $0 [--patch|--minor|--major] [version]

Tags the current commit for production and pushes the tag. Production deploys are
triggered by pushed vX.Y.Z tags.

If version is omitted, the script finds the latest vX.Y.Z tag and bumps to the
next patch version (vX.Y.(Z+1)). Use --minor or --major to bump a different
component. If no release tag exists yet, it starts at v0.1.0.

Examples:
  $0
  $0 --minor
  $0 --major
  $0 v1.2.3
EOF
}

bump_kind="patch"
version=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --patch)
      bump_kind="patch"
      shift
      ;;
    --minor)
      bump_kind="minor"
      shift
      ;;
    --major)
      bump_kind="major"
      shift
      ;;
    v*)
      if [ -n "${version}" ]; then
        usage
        exit 1
      fi
      version="$1"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo ""
      usage
      exit 1
      ;;
  esac
done

if [ -n "${version}" ] && [ "${bump_kind}" != "patch" ]; then
  echo "Do not combine an explicit version with --minor or --major."
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

latest_tag=$(git tag -l 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)

if [ -z "${version}" ]; then
  if [ -z "${latest_tag}" ]; then
    version="v0.1.0"
  else
    semver="${latest_tag#v}"
    IFS=. read -r major minor patch <<<"${semver}"
    case "${bump_kind}" in
      patch)
        version="v${major}.${minor}.$((patch + 1))"
        ;;
      minor)
        version="v${major}.$((minor + 1)).0"
        ;;
      major)
        version="v$((major + 1)).0.0"
        ;;
    esac
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
