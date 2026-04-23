---
name: toolchain-commands
description: Installing dependencies, running dev/build/test/lint, filtering packages, single-test runs, git hooks, preparing a clone (.env.development / .env.test), or Docker-backed local services and dev servers.
---

# Toolchain, commands, and CI

**When to use:** Installing dependencies, running dev/build/test/lint, filtering packages, single-test runs, git hooks, preparing a clone (`.env.development` / `.env.test`), or **Docker-backed local services and dev servers**.

## Stack (summary)

- **Runtime**: Node.js `25` via **`mise.toml`** (also `engines` in root `package.json`). Use `mise install` / `mise exec` so Vitest and `Uint8Array.fromHex` / `toHex` match production; Node 22 lacks those APIs and will fail tests that touch `@repo/utils` crypto helpers.
- **Package manager**: `package.json` `packageManager` field (e.g. pnpm). Install deps: `pnpm install`
- **Task runner**: `turbo` via root scripts
- **Lint/format**: Biome (`@biomejs/biome` 1.9.x)
- **TypeScript**: 6.0.x + **TypeScript 7 beta (`@typescript/native-preview`)** for typechecking. `pnpm typecheck` runs `tsgo` (the native preview binary) — never invoke `tsc` directly in scripts or docs. Builds (`pnpm build`) still go through `tsup` / stock `typescript` — tsgo and Rolldown-based bundlers stay off the production artifact path until they reach stable releases.
- **Tests**: Vitest 3.x
- **Core logic**: Effect TS primitives
- **Postgres ORM**: Drizzle
- **API/ingest boundaries**: Hono
- **Web app**: TanStack Start + React

## Top-level commands (repo root)

- `pnpm dev` — run all workspace `dev` tasks via Turbo
- `pnpm build` — run all workspace builds
- `pnpm check` — run all workspace lint and format check scripts
- `pnpm typecheck` — run all workspace typechecks
- `pnpm test` — run all workspace tests
- `pnpm hooks` — configure local git hooks for this clone

## Git hooks (pre-commit)

- Pre-commit hook lives at `.husky/pre-commit`
- Pre-commit runs: `pnpm check`, `pnpm typecheck`, and `pnpm knip`
- Hooks are auto-configured on dependency install via root `prepare` script (`pnpm hooks`)
- Existing clones should run `pnpm hooks` once to configure `core.hooksPath` and hook permissions

## Package-scoped (`--filter`)

```bash
pnpm --filter @app/api check
pnpm --filter @app/api typecheck
pnpm --filter @app/api build
pnpm --filter @app/api test
```

Path-based filtering also works:

```bash
pnpm --filter ./apps/api test
pnpm --filter ./packages/domain/workspaces check
```

## Single-test workflows

Vitest is invoked as `vitest run --passWithNoTests`:

```bash
# Single test file
pnpm --filter @app/api test -- src/some-file.test.ts

# Test name pattern
pnpm --filter @app/api test -- -t "health endpoint"

# Specific file + name
pnpm --filter @app/api test -- src/some-file.test.ts -t "returns 200"
```

## CI-equivalent local checks

Before opening PRs:

```bash
pnpm check
pnpm typecheck
pnpm test
```

CI workflows (`check.yml`, `typecheck.yml`, `knip.yml`, `test.yml`) use Node 25 + pnpm and run the same commands.

## Cloud agent environment setup

**Before starting work**, ensure `.env.development` and `.env.test` exist. They are required for the dev server, tests, and tooling like `knip`.

```bash
cp .env.example .env.development
cp .env.example .env.test
```

Then set `NODE_ENV` appropriately:

- In `.env.development`: `NODE_ENV=development`
- In `.env.test`: `NODE_ENV=test`

This provides working defaults for all services (Postgres, ClickHouse, Redis, etc.) that match the Docker Compose setup. For **`LAT_*` naming and `parseEnv` usage** when you add variables, see [env-configuration](../env-configuration/SKILL.md).

## Local services (Docker) and dev apps

Start infrastructure before app processes (e.g. in cloud agents or a fresh clone):

```bash
sudo dockerd &>/dev/null &  # if the daemon is not already running
sudo docker compose up -d postgres clickhouse redis redis-bullmq mailpit temporal temporal-ui
```

**Migrations and seeds** (only when the user asked you to set up DBs in this conversation — see [database-postgres](../database-postgres/SKILL.md) and [database-clickhouse-weaviate](../database-clickhouse-weaviate/SKILL.md) for agent rules):

```bash
pnpm --filter @platform/db-postgres pg:migrate
pnpm --filter @platform/db-clickhouse ch:up
pnpm --filter @platform/db-postgres pg:seed       # optional: seed users
pnpm --filter @platform/db-clickhouse ch:seed       # optional: sample spans
```

**Dev servers** (e.g. tmux-style):

```bash
pnpm --filter @app/web dev &
pnpm --filter @app/api dev &
pnpm --filter @app/ingest dev &
pnpm --filter @app/workers dev &
pnpm --filter @app/workflows dev &
```

| Service    | Port | Health check |
| ---------- | ---- | ------------ |
| Web        | 3000 | `curl http://localhost:3000` (redirect to `/login`) |
| API        | 3001 | `curl http://localhost:3001/health` |
| Ingest     | 3002 | `curl http://localhost:3002/health` |
| Workers    | 9090 | `curl http://localhost:9090/health` |
| Workflows  | 9091 | `curl http://localhost:9091/health` |
| Mailpit UI | 8025 | `curl http://localhost:8025` |
| Temporal UI | 8233 | `curl http://localhost:8233` |

**Manual auth:** magic links appear in Mailpit at `http://localhost:8025` after signup at `http://localhost:3000/signup`.
