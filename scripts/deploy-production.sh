#!/bin/bash

set -euo pipefail

echo "Fetching tags from origin..."
git fetch origin --tags

# Get the latest version tag matching v*
latest_tag=$(git tag -l 'v*' --sort=-v:refname | head -n1 || echo "")

if [ -z "$latest_tag" ]; then
  echo "No existing version tags found. Starting from v0.0.0"
  current_major=0
  current_minor=0
  current_patch=0
else
  # Parse the version number (remove 'v' prefix)
  version=${latest_tag#v}
  
  # Handle both v1.2.3 and v.1.2.3 formats
  version=${version#.}
  
  IFS='.' read -r current_major current_minor current_patch <<< "$version"
  echo "Latest tag: $latest_tag"
fi

# Default to patch increment
next_major=$current_major
next_minor=$current_minor
next_patch=$((current_patch + 1))

# Allow user to specify which version component to bump
if [ $# -gt 0 ]; then
  case "$1" in
    major)
      next_major=$((current_major + 1))
      next_minor=0
      next_patch=0
      ;;
    minor)
      next_minor=$((current_minor + 1))
      next_patch=0
      ;;
    patch)
      # Already set to patch increment above
      ;;
    *)
      echo "Usage: $0 [major|minor|patch]"
      echo "  major: Bump major version (e.g., v1.2.3 -> v2.0.0)"
      echo "  minor: Bump minor version (e.g., v1.2.3 -> v1.3.0)"
      echo "  patch: Bump patch version (e.g., v1.2.3 -> v1.2.4) - default"
      exit 1
      ;;
  esac
fi

new_version="v${next_major}.${next_minor}.${next_patch}"

# Check if tag already exists locally
if git tag -l "$new_version" | grep -q "^${new_version}$"; then
  echo "Error: Tag $new_version already exists locally!"
  exit 1
fi

# Check if tag already exists on remote
if git ls-remote --tags origin "refs/tags/${new_version}" | grep -q "${new_version}"; then
  echo "Error: Tag $new_version already exists on origin!"
  exit 1
fi

echo "Creating tag: $new_version"
echo ""
echo "This will trigger a production deployment that:"
echo "  1. Runs build checks (typecheck, lint, tests)"
echo "  2. Builds and pushes container images"
echo "  3. Executes database migrations"
echo "  4. Deploys to ECS Fargate"
echo ""

read -p "Are you sure? [y/N] " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# Create tag only (don't push)
echo "Creating tag $new_version..."
git tag "$new_version"

echo ""
echo "Tag $new_version created locally!"
echo "To deploy to production, push the tag:"
echo "  git push origin $new_version"
echo ""
echo "Monitor the deployment at: https://github.com/latitude-dev/latitude-llm/actions"
echo ""
echo "Verify deployment health:"
echo "  - https://console.latitude.so/api/health"
echo "  - https://api.latitude.so/health"
echo "  - https://ingest.latitude.so/health"
