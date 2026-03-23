# AGENTS.md

High-level guide for coding agents working in this repository.

## Product scope

Multi-tenant LLM observability platform. The repo is a **pnpm** workspace orchestrated with **Turbo**.

At a glance: **`apps/*`** own HTTP boundaries (validation, authz, routing to use-cases); **`packages/domain/*`** own business rules and ports; **`packages/platform/*`** implement infrastructure adapters; **`@repo/utils`** holds cross-cutting pure helpers. Telemetry and control data flow through **Postgres**, **ClickHouse**, **Weaviate**, **Redis**, and object storage, with **organization-scoped** access everywhere at the boundary.

## How to use this guide

1. Skim the **skill glossary** below and open the skill that matches your task.
2. Read that skill’s `SKILL.md` in full before editing code in that area.

Detailed policies, command examples, and code samples live under **`.agents/skills/<skill-name>/SKILL.md`**. Load narrow skills instead of memorizing the entire monorepo at once.

**Index coverage:** The glossary lists **every** skill in `.agents/skills/` (one row per `*/SKILL.md`, **11** total), ordered **alphabetically by folder name**. When you add or remove a skill folder, update this table in the same change.

## Skill glossary

| Skill | Path | Use when |
| --- | --- | --- |
| **Architecture and boundaries** | [.agents/skills/architecture-boundaries/SKILL.md](.agents/skills/architecture-boundaries/SKILL.md) | Layering, web vs public API, **app layout** (clients, routes, logging), ports/adapters, **web-standard APIs in domain/shared/utils**, multi-tenancy, DDD layout, anti-patterns |
| **Background jobs and events** | [.agents/skills/async-jobs-and-events/SKILL.md](.agents/skills/async-jobs-and-events/SKILL.md) | **Queues/workers**, **domain events**, side effects **outside** HTTP handlers, **new platform `*-core` / `*-provider`** dependencies |
| **Authentication** | [.agents/skills/authentication/SKILL.md](.agents/skills/authentication/SKILL.md) | **Better Auth**, sessions, web session helpers, org context on session, **`@domain/auth`** flows |
| **Code style and TypeScript** | [.agents/skills/code-style/SKILL.md](.agents/skills/code-style/SKILL.md) | Biome, imports, strict TS, naming, React file names, generated files |
| **ClickHouse and Weaviate** | [.agents/skills/database-clickhouse-weaviate/SKILL.md](.agents/skills/database-clickhouse-weaviate/SKILL.md) | Parameterized CH queries, Goose migrations, Weaviate collections/migrations |
| **Postgres and SqlClient** | [.agents/skills/database-postgres/SKILL.md](.agents/skills/database-postgres/SKILL.md) | Drizzle schema, RLS, SqlClient, migrations (Drizzle Kit), repository mappers |
| **Effect and errors** | [.agents/skills/effect-and-errors/SKILL.md](.agents/skills/effect-and-errors/SKILL.md) | `Effect` composition, `Data.TaggedError`, `HttpError`, boundary error handling |
| **Environment configuration** | [.agents/skills/env-configuration/SKILL.md](.agents/skills/env-configuration/SKILL.md) | **`LAT_*` / `VITE_LAT_*`**, `.env.example`, **`parseEnv` / `parseEnvOptional`** |
| **Testing** | [.agents/skills/testing/SKILL.md](.agents/skills/testing/SKILL.md) | Vitest layers, PGlite/chdb testkit, **`/testing` package exports**, avoiding `vi.mock` for repositories |
| **Toolchain and commands** | [.agents/skills/toolchain-commands/SKILL.md](.agents/skills/toolchain-commands/SKILL.md) | Node/pnpm/Turbo/Vitest/Biome, scripts, filters, CI, `.env.*` setup, **Docker Compose, dev servers, Mailpit** |
| **Web frontend** | [.agents/skills/web-frontend/SKILL.md](.agents/skills/web-frontend/SKILL.md) | `apps/web` UI, TanStack Start, collections, `@repo/ui`, layout, **`useMountEffect` policy** |
