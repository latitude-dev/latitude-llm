# AGENTS.md

High-level guide for coding agents working in this repository.

## Product scope

Multi-tenant LLM observability platform. The repo is a **pnpm** workspace orchestrated with **Turbo**.

At a glance: **`apps/*`** own HTTP boundaries (validation, authz, routing to use-cases); **`packages/domain/*`** own business rules and ports; **`packages/platform/*`** implement infrastructure adapters; **`@repo/utils`** holds cross-cutting pure helpers. Telemetry and control data flow through **Postgres**, **ClickHouse**, **Weaviate**, **Redis**, and object storage, with **organization-scoped** access everywhere at the boundary.

## Repo-wide conventions

- Organization-scoped Redis or cache keys must start with the organization prefix: `org:${organizationId}:...`. Put the org id first so tenancy is obvious and keyspaces stay consistently partitioned.
- Never invoke `tsc` directly. Typechecking goes through `tsgo` via the package `typecheck` script — use `pnpm --filter <pkg> typecheck` for one package or `pnpm typecheck` for the whole workspace. `tsc` would diverge from CI.

## How to use this guide

1. Skim the **skill glossary** below and open the skill that matches your task.
2. Read that skill's `SKILL.md` in full before editing code in that area.

Detailed policies, command examples, and code samples live under **`.agents/skills/<skill-name>/SKILL.md`**. Load narrow skills instead of memorizing the entire monorepo at once.

**Index coverage:** The glossary lists **every** skill in `.agents/skills/` (one row per `*/SKILL.md`, **15** total), ordered **alphabetically by folder name**. When you add or remove a skill folder, update this table in the same change.

## Skill glossary

| Skill | Path | Use when |
| --- | --- | --- |
| **Agentation watch mode** | [.agents/skills/agentation-watch-mode/SKILL.md](.agents/skills/agentation-watch-mode/SKILL.md) | Agentation annotation watch loops, continuous feedback handling, or when the user says **`watch mode`** and wants annotations acknowledged, fixed, and resolved as they arrive |
| **Architecture and boundaries** | [.agents/skills/architecture-boundaries/SKILL.md](.agents/skills/architecture-boundaries/SKILL.md) | Layering, web vs public API, **app layout** (clients, routes, logging), ports/adapters, **web-standard APIs in domain/shared/utils**, multi-tenancy, DDD layout, anti-patterns, **machine-facing MCP/API product surfaces** |
| **Background jobs and events** | [.agents/skills/async-jobs-and-events/SKILL.md](.agents/skills/async-jobs-and-events/SKILL.md) | **Queues/workers**, **domain events**, side effects **outside** HTTP handlers, task payload design, debounce/dedupe, delayed job semantics, **domain event naming**, **publisher–consumer decoupling** |
| **Authentication** | [.agents/skills/authentication/SKILL.md](.agents/skills/authentication/SKILL.md) | **Better Auth**, sessions, web session helpers, org context on session, **`@domain/auth`** flows |
| **Backoffice** | [.agents/skills/backoffice/SKILL.md](.agents/skills/backoffice/SKILL.md) | Staff-only `/backoffice` features, **`createAdminServerFn`** factory, admin guards + RLS-bypass path, `@domain/admin` feature-folder layout |
| **Better Auth best practices** | [.agents/skills/better-auth-best-practices/SKILL.md](.agents/skills/better-auth-best-practices/SKILL.md) | **Better Auth** server/client setup, DB adapters, sessions, plugins, env (`auth.ts`); email/password, OAuth; **better-auth.com** API reference |
| **Code style and TypeScript** | [.agents/skills/code-style/SKILL.md](.agents/skills/code-style/SKILL.md) | Biome, imports, strict TS, naming, **Zod-first shared contracts**, literal-union enums, named constants, generated files |
| **ClickHouse and Weaviate** | [.agents/skills/database-clickhouse-weaviate/SKILL.md](.agents/skills/database-clickhouse-weaviate/SKILL.md) | Parameterized CH queries, Goose migrations, append-only migration rules, Weaviate collections/migrations |
| **Postgres and SqlClient** | [.agents/skills/database-postgres/SKILL.md](.agents/skills/database-postgres/SKILL.md) | Drizzle schema, RLS, SqlClient, migrations (Drizzle Kit), no-FK rules, repository mappers |
| **Documentation and specs** | [.agents/skills/docs/SKILL.md](.agents/skills/docs/SKILL.md) | **`dev-docs/*.md`** (domain), **`docs/`** (ADRs, Mintlify), **`specs/*.md`**, durable documentation sync, spec structure, promoting stable knowledge into `dev-docs/` |
| **Effect and errors** | [.agents/skills/effect-and-errors/SKILL.md](.agents/skills/effect-and-errors/SKILL.md) | `Effect` composition, `Data.TaggedError`, `HttpError`, boundary error handling |
| **Environment configuration** | [.agents/skills/env-configuration/SKILL.md](.agents/skills/env-configuration/SKILL.md) | **`LAT_*` / `VITE_LAT_*`**, `.env.example`, **`parseEnv` / `parseEnvOptional`** |
| **Testing** | [.agents/skills/testing/SKILL.md](.agents/skills/testing/SKILL.md) | Vitest layers, PGlite/chdb testkit, **`/testing` package exports**, avoiding `vi.mock` for repositories |
| **Toolchain and commands** | [.agents/skills/toolchain-commands/SKILL.md](.agents/skills/toolchain-commands/SKILL.md) | Node/pnpm/Turbo/Vitest/Biome, scripts, filters, CI, `.env.*` setup, **Docker Compose, dev servers, Mailpit** |
| **Web frontend** | [.agents/skills/web-frontend/SKILL.md](.agents/skills/web-frontend/SKILL.md) | `apps/web` UI, TanStack Start, collections, `@repo/ui`, layout, **`-components/`**, legacy UI reference, **`useMountEffect` policy**, **`useForm` + `createFormSubmitHandler` + `fieldErrorsAsStrings`** for Zod field errors on forms |

## Cursor Cloud specific instructions

The update script runs `scripts/cloud-install.sh` and `scripts/cloud-start.sh` on every session start — dependencies are installed, Docker infra is started, and all databases are migrated and seeded automatically.

For services, ports, health checks, Docker Compose, dev servers, and Mailpit auth flow, see [toolchain-commands skill](.agents/skills/toolchain-commands/SKILL.md). Seeded users include `owner@acme.com`, `admin@acme.com`, etc., all in the "Acme Inc." organization.

**Cloud-only gotchas:**

- `pnpm build` must complete before `pnpm db:up` — migration scripts depend on compiled platform packages.
- The `pnpm install` output may warn about unapproved build scripts (`@swc/core`, `sharp`, etc.). These are non-blocking — pre-built binaries are used.
- The Docker daemon in cloud VMs needs `fuse-overlayfs` storage driver and `iptables-legacy`. The update script handles this.
