#!/usr/bin/env bash
set -euo pipefail

# Thin wrapper around the `fern` CLI. Handles two host-environment quirks
# before delegating to `fern`:
#
# 1. Docker socket discovery. Fern's default probe (`/var/run/docker.sock`)
#    misses the paths used by OrbStack, Colima, and newer Docker Desktop
#    installs — see https://github.com/fern-api/fern/issues/2392. We read the
#    real socket via `docker context inspect` and export it as `DOCKER_HOST`.
#    Harmless for fern subcommands that don't touch Docker (e.g. `fern check`).
#
# 2. pnpm config leaking into child npm. pnpm exports its own settings
#    (`public-hoist-pattern`, `catalog`, `store-dir`, …) as `npm_config_*`
#    env vars. Older `npm` — both the one the `fern` CLI shells out to and
#    the one inside the generator Docker image — spams warnings about
#    "Unknown env config" on every call. Stripping them here keeps the
#    generator output clean.
#
# Usage (via pnpm scripts, not directly):
#   ./fern/invoke.sh check
#   ./fern/invoke.sh generate --group local --local

unset \
  npm_config_public_hoist_pattern \
  npm_config_npm_globalconfig \
  npm_config_verify_deps_before_run \
  npm_config_catalog \
  npm_config__jsr_registry \
  npm_config_store_dir \
  2>/dev/null || true

if command -v docker >/dev/null 2>&1; then
  DOCKER_HOST_VALUE="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
  if [ -n "$DOCKER_HOST_VALUE" ]; then
    export DOCKER_HOST="$DOCKER_HOST_VALUE"
  fi
fi

exec fern "$@"
