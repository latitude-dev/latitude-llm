# AGENTS.md

Operational guide for coding agents working in this repository.

## Repository Snapshot

- Monorepo managed with `pnpm` workspaces + `turbo`.
- Runtime stack is TypeScript-first (`strict` mode enabled).
- Apps live in `apps/*`:
  - `apps/web` (Vite + Solid)
  - `apps/api` (Hono)
  - `apps/ingest`, `apps/workers`, `apps/workflows` (TS services)
- Shared packages live in `packages/**`:
  - `packages/domain/*` for domain contracts/types
  - `packages/platform/*` for adapters/infrastructure boundaries
  - `packages/contracts`, `packages/observability`, `packages/testkit`
  - `packages/vitest-config`, `packages/tsconfig`

## Required Toolchain

- Node.js: `>=26` (see root `package.json`).
- Package manager: `pnpm@9`.
- Task runner: `turbo` via root scripts.
- Lint/format: Biome (`@biomejs/biome` 1.9.x).
- Tests: Vitest 3.x.
- Install deps: `pnpm install`.

## Top-Level Commands

Run from repo root unless noted.

- `pnpm dev` -> run all workspace `dev` tasks via Turbo.
- `pnpm build` -> run all workspace builds.
- `pnpm lint` -> run all workspace lint scripts.
- `pnpm format` -> auto-fix formatting/lint where configured (`turbo lint -- --write`).
- `pnpm format:check` -> currently aliases `pnpm lint` at root.
- `pnpm typecheck` -> run all workspace typechecks.
- `pnpm test` -> run all workspace tests.

## Package-Scoped Commands

Use `--filter` to avoid running the entire monorepo.

- Lint one package: `pnpm --filter @app/api lint`
- Typecheck one package: `pnpm --filter @app/api typecheck`
- Build one package: `pnpm --filter @app/api build`
- Test one package: `pnpm --filter @app/api test`

Path-based filtering also works:

- `pnpm --filter ./apps/api test`
- `pnpm --filter ./packages/domain/workspaces lint`

## Single-Test Workflows (Important)

Vitest is invoked in each workspace as `vitest run --passWithNoTests`.

- Single test file: `pnpm --filter @app/api test -- src/some-file.test.ts`
- Test name pattern: `pnpm --filter @app/api test -- -t "health endpoint"`
- Specific file + name: `pnpm --filter @app/api test -- src/some-file.test.ts -t "returns 200"`

If package name is unknown, use path filters:

- `pnpm --filter ./apps/api test -- src/some-file.test.ts`

## CI-Equivalent Local Checks

Before opening PRs, mirror CI basics:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

`node-lint.yml`, `typecheck.yml`, and `test.yml` use Node 26 + pnpm 9 and run the same commands.

## Code Style: Formatter and Syntax

Biome config (`biome.json`) is the source of truth.

- Indentation: 2 spaces.
- Max line width: 100.
- Strings: double quotes.
- Semicolons: always.
- Ignore generated/output dirs: `dist`, `coverage`, `.turbo`, `node_modules`.
- Prefer package-local formatting for changed workspace (`pnpm --filter @app/api format`).

## Imports

- Prefer static imports; avoid dynamic import patterns unless justified.
- Use `import type { ... }` for type-only imports.
- Keep imports explicit and grep-friendly.
- Preserve clear grouping/order (external, internal alias, then relative).
- Avoid wildcard exports/imports when explicit named exports are practical.

## TypeScript and Types

Base config: `tsconfig.base.json`.

- `strict: true` is enabled; keep code strict-clean.
- Module system: `NodeNext` + ESM (`"type": "module"` in packages/apps).
- Prefer explicit domain types/interfaces over loose objects.
- Use `readonly` fields for immutable domain data shapes where appropriate.
- Avoid `any`; use `unknown` + narrowing.
- Validate boundary inputs early (API input, queue payloads, external IO).

## Naming Conventions

- Types/interfaces/classes: `PascalCase`.
- Variables/functions/methods: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` only for true constants; otherwise `camelCase` + `as const`.
- File names currently favor concise module roots (`src/index.ts`, `src/server.ts`, `src/main.tsx`).
- Package names follow scoped workspace style (`@app/*`, `@domain/*`, etc.).

## Architecture and Dependency Guidelines

- Keep domain packages focused on domain language/contracts.
- Keep platform packages as adapter boundaries (db/cache/queue/storage/outbox).
- Depend on stable abstractions, not volatile implementation details.
- Prefer data-structure clarity before complex control flow.
- Keep code grep-friendly; avoid clever dynamic dispatch that hides call sites.

## Async and Background Task Guidance

- Pass IDs in async jobs/queue payloads, not full mutable models.
- Re-fetch current state inside task handlers.
- Make stale/deleted entity behavior explicit.

## Testing Conventions

- Test runner: Vitest.
- Shared default environment: Node with globals enabled (`packages/vitest-config/index.ts`).
- Keep tests deterministic and isolated.
- Prefer package-local runs during iteration; run full monorepo tests before PR.

## Agent Workflow Expectations

- Make minimal, scoped changes.
- Do not edit unrelated files.
- Run targeted checks first, then broader checks.
- When changing a single workspace, prefer filtered commands.
- Update docs when behavior/commands/conventions change.

## Cursor/Copilot Rule Files

Checked for:

- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

Current status:

- No Cursor or Copilot instruction files were found.
- Use this `AGENTS.md` plus existing repo configs as the operative guidance.
