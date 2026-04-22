# Fern SDK generation

This directory configures [Fern](https://buildwithfern.com/) to generate the
public `@latitude-data/sdk` TypeScript client from our OpenAPI spec.

We run Fern **entirely locally via Docker** — no Fern account, no
`FERN_TOKEN`, no cloud generation. This document explains how that works and
how to regenerate the SDK.

## Layout

```
fern/
  fern.config.json   # Fern workspace identity (organization + CLI pin)
  generators.yml     # Which generators run, pointed at apps/api/openapi.json
  invoke.sh          # Wrapper: fixes Docker socket discovery + suppresses pnpm/npm warnings
  README.md          # (this file)
```

The generator writes a full TypeScript source tree **directly into**
`packages/sdk/typescript/src/` — `Client.ts`, `index.ts`, `environments.ts`,
`api/`, `core/`, `errors/`. There is no nested `src/generated/`; Fern owns
everything under `src/` and overwrites it on every regen. The package shell
(`package.json`, `tsconfig.json`, `tsup.config.ts`, `.gitignore`) sits one
level up at `packages/sdk/typescript/` and is hand-written. Consumers import
from `@latitude-data/sdk` and resolve through the built `dist/` output — they
never touch `src/` directly.

## How `--local` works

Fern CLI is two things stitched together:

1. **A config reader + IR builder.** Reads `fern/` and
   `apps/api/openapi.json`, validates, produces an intermediate
   representation.
2. **A generator runner.** Hands the IR to a versioned Docker image
   (`fernapi/fern-typescript-node-sdk:X.Y.Z`). The generator image — not the
   CLI — is what actually writes SDK source files.

There are two runtimes for the generator:

- Without `--local` (cloud): CLI uploads the IR to Fern's hosted service,
  Fern runs the generator there, ships the output back. Requires
  `fern login` and a `FERN_TOKEN` for CI. We do **not** use this.
- With `--local`: CLI spawns the same generator image on **your host's
  Docker daemon**, bind-mounts the output path, the container writes files
  and exits. No network call to Fern beyond the initial image pull.

So "Fern without the cloud" = `--local` + Docker running.

Why this is a fine trade: Docker is already a required dependency for local
development in this repo (Postgres, ClickHouse, Redis, Temporal, etc., all
live in `docker-compose.yml`). Adding an on-demand Fern container on top of
that daemon adds nothing contributors don't already have.

## Prerequisites

- **Fern CLI**: already a root devDep (`fern-api` in `package.json`). Running
  `pnpm install` puts it on the workspace's `node_modules/.bin` path, so all
  the scripts below find it automatically. No global install needed.
- **Docker daemon running** (Docker Desktop, OrbStack, Colima, Podman — any
  works). Verify: `docker ps` should list our compose services.
- **`docker` on `$PATH`** so the Fern CLI can shell out to it. Docker Desktop
  on macOS installs the binary at
  `/Applications/Docker.app/Contents/Resources/bin/docker` — add that to
  `$PATH` in `~/.zshrc` or symlink it into `/usr/local/bin`.
- Enough disk for the generator image (~300–500 MB on first pull; cached
  after).

## Regenerating the SDK

From the repo root, with Docker running:

```bash
pnpm generate:sdk
```

That one command runs three steps (also available individually):

```bash
pnpm openapi:emit    # 1. Emit a fresh OpenAPI spec from the live routes.
pnpm sdk:check       # 2. Validate the Fern config against the spec. (No Docker needed.)
pnpm generate:sdk    # 3. Composite: emit + check + `./fern/invoke.sh generate --group local --local`.
```

Fern writes generated TypeScript sources into
`packages/sdk/typescript/src/` (`Client.ts`, `index.ts`, `environments.ts`,
`api/`, `core/`, `errors/`). The surrounding package shell —
`package.json`, `tsconfig.json`, `tsup.config.ts`, and any re-exports —
is hand-written at `packages/sdk/typescript/`. Fern owns the contents of
`src/` and overwrites them on every regen; don't edit anything under
`src/` directly.

### What `fern/invoke.sh` does

The wrapper handles two host-environment quirks before delegating to the
`fern` CLI:

1. **Docker socket discovery.** Fern probes `/var/run/docker.sock` by
   default, which misses the paths used by OrbStack, Colima, and newer
   Docker Desktop installs (see
   [fern-api/fern#2392](https://github.com/fern-api/fern/issues/2392)).
   The script reads the real socket via
   `docker context inspect --format '{{.Endpoints.docker.Host}}'` and
   exports it as `DOCKER_HOST`.
2. **pnpm config leaking into child npm.** pnpm exports its own settings
   (`public-hoist-pattern`, `catalog`, `store-dir`, …) as `npm_config_*`
   env vars. Older `npm` — both the one `fern` shells out to on the host
   and the one inside the generator Docker image — spams "Unknown env
   config" warnings on every call. The wrapper unsets the known offenders
   before invoking `fern` so the output stays clean.

Both `pnpm sdk:check` and `pnpm generate:sdk` go through the wrapper, so
both benefit from these fixes.

The `--group local` flag matches the `groups.local` entry in
`generators.yml`. The trailing `--local` tells Fern to spawn the generator on
the host Docker daemon rather than calling out to the cloud.

## docker-compose

**We do not add Fern to `docker-compose.yml`.** The compose file is for
long-running services (Postgres, ClickHouse, …). The Fern generator is a
short-lived, on-demand container — it runs for seconds and exits. Fern's CLI
spawns it directly against the host Docker daemon; compose adds nothing and
would only introduce nested Docker-in-Docker complexity.

## CI

Not wired in this PR. A follow-up will add a drift check (regenerate the SDK
and fail if `git status` is dirty) and a publish workflow mirroring
`.github/workflows/publish-typescript-telemetry.yml`.

## Troubleshooting

- **`Login required`** running `fern generate` (no `--local`): you're on the
  cloud path. We don't use it — add `--local`.
- **`Docker exited with code undefined`**: Docker isn't running, or `docker`
  isn't on `$PATH`. Start Docker Desktop (or your equivalent) and verify
  `docker ps` works before retrying.
- **`fern check` fails**: the committed OpenAPI is stale or inconsistent with
  `fern/` config. Re-run `pnpm --filter @app/api openapi:emit` first.
- **Changes to route shapes aren't reflected in the SDK**: you skipped step 1
  (`openapi:emit`) so the spec on disk is stale. Re-run and regenerate.
