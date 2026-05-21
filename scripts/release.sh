#!/bin/bash

set -euo pipefail

export GIT_PAGER=cat

usage() {
  cat <<EOF
Usage: $0 [--patch|--minor|--major] [--dry] [--skip-staging-check] [version]

Tags the current commit for production and pushes the tag. Production deploys are
triggered by pushed vX.Y.Z tags.

If version is omitted, the script finds the latest vX.Y.Z tag and bumps to the
next patch version (vX.Y.(Z+1)). Use --minor or --major to bump a different
component. If no release tag exists yet, it starts at v0.1.0.

Before tagging, prints a summary of the changes that will be deployed and asks
for confirmation. Use --dry to print the summary only without creating or
pushing the tag.

Use --skip-staging-check to release a commit that has not been deployed to
staging. The tag is created as annotated with a "skip-staging-check" marker,
which the CI deploy workflow reads to bypass the staging-deployment
prerequisite. Use sparingly — staging exists for a reason.

Examples:
  $0
  $0 --minor
  $0 --major
  $0 v1.2.3
  $0 --dry
  $0 --skip-staging-check
EOF
}

bump_kind="patch"
version=""
dry_run=0
skip_staging_check=0

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
    --dry | --dry-run)
      dry_run=1
      shift
      ;;
    --skip-staging-check)
      skip_staging_check=1
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

short_sha=$(git rev-parse --short "${target_sha}")
if [ -n "${latest_tag}" ]; then
  diff_range="${latest_tag}..${target_sha}"
  range_label="${latest_tag} → ${version}"
else
  diff_range="${target_sha}"
  range_label="(initial release) → ${version}"
fi

shortstat=$(git diff --shortstat "${diff_range}")
files_changed=$(git diff --numstat "${diff_range}" | awk 'END { print NR }')
insertions=$(git diff --numstat "${diff_range}" | awk '{ a += ($1 == "-" ? 0 : $1) } END { print a + 0 }')
deletions=$(git diff --numstat "${diff_range}" | awk '{ d += ($2 == "-" ? 0 : $2) } END { print d + 0 }')
commit_count=$(git rev-list --count "${diff_range}")

echo ""
echo "Release summary"
echo "  Range:    ${range_label}"
echo "  Target:   ${short_sha} (${target_sha})"
echo "  Commits:  ${commit_count}"
echo "  Files:    ${files_changed} changed"
echo "  Lines:    +${insertions} / -${deletions}"
if [ -n "${shortstat}" ]; then
  echo "  Git:     ${shortstat# }"
fi
echo ""

if [ "${dry_run}" -eq 1 ]; then
  if [ "${skip_staging_check}" -eq 1 ]; then
    echo "Dry run: not creating or pushing tag ${version} (would skip staging deployment check)."
  else
    echo "Dry run: not creating or pushing tag ${version}."
  fi
  exit 0
fi

if [ "${skip_staging_check}" -eq 1 ]; then
  echo "WARNING: --skip-staging-check is set. The CI deploy workflow will NOT require"
  echo "that ${short_sha} has a successful staging deployment before going to production."
else
  echo "Confirm that ${short_sha} has already been deployed to staging and verified there."
  echo "Production tags should only point at commits that are live on staging."
fi
echo ""
read -r -p "Tag ${target_sha} as ${version} and push to origin? [y/N] " response
case "${response}" in
  [yY] | [yY][eE][sS]) ;;
  *)
    echo "Aborted. No tag created."
    exit 0
    ;;
esac

echo "Tagging ${target_sha} as ${version}..."
if [ "${skip_staging_check}" -eq 1 ]; then
  git tag -a "${version}" "${target_sha}" -m "${version}

skip-staging-check: production deploy was authorized without a prior staging deployment."
else
  git tag "${version}" "${target_sha}"
fi
git push origin "refs/tags/${version}"

echo "Pushed ${version}. The production deploy workflow will deploy the tagged commit after validation."
