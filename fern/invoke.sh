#!/usr/bin/env bash
set -euo pipefail

# Thin wrapper around the `fern` CLI. Handles three host-environment quirks
# before delegating to `fern`:
#
# 1. Binary lookup. We resolve the CLI from the workspace's `node_modules/.bin/`
#    by filesystem path instead of `$PATH`. That way the wrapper works both
#    from `pnpm` scripts (which mung PATH) and from raw CI shells (which
#    don't). Without this, calling `./fern/invoke.sh` directly resolved
#    `fern` to the `fern/` directory at the repo root and tripped
#    `exec: fern: cannot execute: Is a directory`.
#
# 2. Docker socket discovery. Fern's default probe (`/var/run/docker.sock`)
#    misses the paths used by OrbStack, Colima, and newer Docker Desktop
#    installs — see https://github.com/fern-api/fern/issues/2392. We read the
#    real socket via `docker context inspect` and export it as `DOCKER_HOST`.
#    Harmless for fern subcommands that don't touch Docker (e.g. `fern check`)
#    and for Linux runners where the default socket already works.
#
# 3. pnpm config leaking into child npm. pnpm exports its own settings
#    (`public-hoist-pattern`, `catalog`, `store-dir`, …) as `npm_config_*`
#    env vars. Older `npm` — both the one the `fern` CLI shells out to and
#    the one inside the generator Docker image — spams warnings about
#    "Unknown env config" on every call. Stripping them here keeps the
#    generator output clean.
#
# Usage (via pnpm scripts or directly):
#   ./fern/invoke.sh check
#   ./fern/invoke.sh generate --group local --local

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FERN_BIN="${SCRIPT_DIR}/../node_modules/.bin/fern"

if [ ! -x "$FERN_BIN" ]; then
  echo "fern CLI not found at $FERN_BIN — run 'pnpm install' first." >&2
  exit 1
fi

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

exec "$FERN_BIN" "$@"
