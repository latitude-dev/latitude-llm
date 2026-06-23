#!/bin/bash

set -euo pipefail

export GIT_PAGER=cat

usage() {
  cat <<EOF
Usage: $0 [--patch|--minor|--major] [--dry] [--yes] [version]

Tags the latest origin/development commit for production and pushes the tag. Production deploys are
triggered by pushed vX.Y.Z tags.

If version is omitted, the script finds the latest vX.Y.Z tag and bumps to the
next patch version (vX.Y.(Z+1)). Use --minor or --major to bump a different
component. If no release tag exists yet, it starts at v0.1.0.

Before tagging, prints a summary of the changes that will be deployed and asks
for confirmation. Use --dry to print the summary only without creating or
pushing the tag. Use --yes to skip the confirmation prompt (required when
running without a terminal, e.g. an agent or CI).

Examples:
  $0
  $0 --minor
  $0 --major
  $0 v1.2.3
  $0 --dry
  $0 --yes
EOF
}

bump_kind="patch"
version=""
dry_run=0
assume_yes=0

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
    -y | --yes)
      assume_yes=1
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

target_sha=$(git rev-parse origin/development)

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

# The Helm chart version tracks the Latitude release; the bump lands in the
# release commit (with CHANGELOG.md) so the tagged commit ships a matching chart.
release_semver="${version#v}"
chart_version=$(git show "${target_sha}:charts/latitude/Chart.yaml" | awk '$1 == "version:" { print $2; exit }')
chart_app_version=$(git show "${target_sha}:charts/latitude/Chart.yaml" | awk '$1 == "appVersion:" { gsub(/"/, "", $2); print $2; exit }')
if [ "${chart_version}" != "${release_semver}" ] || [ "${chart_app_version}" != "${release_semver}" ]; then
  echo "Helm chart version mismatch at origin/development: charts/latitude/Chart.yaml has"
  echo "version ${chart_version} / appVersion ${chart_app_version}, but the release is ${version}."
  echo "Set both to ${release_semver} in the release commit, push to origin/development, and re-run."
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
  echo "Dry run: not creating or pushing tag ${version}."
  exit 0
fi

if [ "${assume_yes}" -ne 1 ]; then
  if [ ! -t 0 ]; then
    echo "No terminal available to confirm the release. Re-run with --yes to tag ${version} non-interactively."
    exit 1
  fi
  read -r -p "Tag latest origin/development commit ${target_sha} as ${version} and push to origin? [y/N] " response
  case "${response}" in
    [yY] | [yY][eE][sS]) ;;
    *)
      echo "Aborted. No tag created."
      exit 0
      ;;
  esac
fi

echo "Tagging ${target_sha} as ${version}..."
git tag "${version}" "${target_sha}"
git push origin "refs/tags/${version}"

echo "Pushed ${version}. The production deploy workflow will deploy the tagged commit after validation."
