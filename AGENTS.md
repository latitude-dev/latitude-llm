# AGENTS.md

High-level guide for coding agents working in this repository.

## Product scope

Multi-tenant LLM observability platform. The repo is a **pnpm** workspace orchestrated with **Turbo**.

At a glance: **`apps/*`** own HTTP boundaries (validation, authz, routing to use-cases); **`packages/domain/*`** own business rules and ports; **`packages/platform/*`** implement infrastructure adapters; **`@repo/utils`** holds cross-cutting pure helpers. Telemetry and control data flow through **Postgres**, **ClickHouse**, **Weaviate**, **Redis**, and object storage, with **organization-scoped** access everywhere at the boundary.

## How to use this guide

1. Skim the **skill glossary** below and open the skill that matches your task.
2. Read that skill's `SKILL.md` in full before editing code in that area.

Detailed policies, command examples, and code samples live under **`.agents/skills/<skill-name>/SKILL.md`**. Load narrow skills instead of memorizing the entire monorepo at once.

**Index coverage:** The glossary lists **every** skill in `.agents/skills/` (one row per `*/SKILL.md`, **13** total), ordered **alphabetically by folder name**. When you add or remove a skill folder, update this table in the same change.

## Skill glossary

| Skill | Path | Use when |
| --- | --- | --- |
| **Architecture and boundaries** | [.agents/skills/architecture-boundaries/SKILL.md](.agents/skills/architecture-boundaries/SKILL.md) | Layering, web vs public API, **app layout** (clients, routes, logging), ports/adapters, **web-standard APIs in domain/shared/utils**, multi-tenancy, DDD layout, anti-patterns, **machine-facing MCP/API product surfaces** |
| **Background jobs and events** | [.agents/skills/async-jobs-and-events/SKILL.md](.agents/skills/async-jobs-and-events/SKILL.md) | **Queues/workers**, **domain events**, side effects **outside** HTTP handlers, task payload design, debounce/dedupe, delayed job semantics |
| **Authentication** | [.agents/skills/authentication/SKILL.md](.agents/skills/authentication/SKILL.md) | **Better Auth**, sessions, web session helpers, org context on session, **`@domain/auth`** flows |
| **Better Auth best practices** | [.agents/skills/better-auth-best-practices/SKILL.md](.agents/skills/better-auth-best-practices/SKILL.md) | **Better Auth** server/client setup, DB adapters, sessions, plugins, env (`auth.ts`); email/password, OAuth; **better-auth.com** API reference |
| **Code style and TypeScript** | [.agents/skills/code-style/SKILL.md](.agents/skills/code-style/SKILL.md) | Biome, imports, strict TS, naming, **Zod-first shared contracts**, literal-union enums, named constants, generated files |
| **ClickHouse and Weaviate** | [.agents/skills/database-clickhouse-weaviate/SKILL.md](.agents/skills/database-clickhouse-weaviate/SKILL.md) | Parameterized CH queries, Goose migrations, append-only migration rules, Weaviate collections/migrations |
| **Postgres and SqlClient** | [.agents/skills/database-postgres/SKILL.md](.agents/skills/database-postgres/SKILL.md) | Drizzle schema, RLS, SqlClient, migrations (Drizzle Kit), no-FK rules, repository mappers |
| **Documentation and specs** | [.agents/skills/docs/SKILL.md](.agents/skills/docs/SKILL.md) | **`docs/*.md`**, **`specs/*.md`**, durable documentation sync, spec structure, promoting stable knowledge into docs |
| **Effect and errors** | [.agents/skills/effect-and-errors/SKILL.md](.agents/skills/effect-and-errors/SKILL.md) | `Effect` composition, `Data.TaggedError`, `HttpError`, boundary error handling |
| **Environment configuration** | [.agents/skills/env-configuration/SKILL.md](.agents/skills/env-configuration/SKILL.md) | **`LAT_*` / `VITE_LAT_*`**, `.env.example`, **`parseEnv` / `parseEnvOptional`** |
| **Testing** | [.agents/skills/testing/SKILL.md](.agents/skills/testing/SKILL.md) | Vitest layers, PGlite/chdb testkit, **`/testing` package exports**, avoiding `vi.mock` for repositories |
| **Toolchain and commands** | [.agents/skills/toolchain-commands/SKILL.md](.agents/skills/toolchain-commands/SKILL.md) | Node/pnpm/Turbo/Vitest/Biome, scripts, filters, CI, `.env.*` setup, **Docker Compose, dev servers, Mailpit** |
| **Web frontend** | [.agents/skills/web-frontend/SKILL.md](.agents/skills/web-frontend/SKILL.md) | `apps/web` UI, TanStack Start, collections, `@repo/ui`, layout, **`-components/`**, legacy UI reference, **`useMountEffect` policy** |

<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

### Local Effect Source

The Effect v4 repository is cloned to `~/.local/share/effect-solutions/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.

<!-- effect-solutions:end -->

<!-- domain-schema-and-module-conventions:start -->

## Domain Schema And Module Conventions

- Domain **entities** are **Zod-first**: `entitySchema` + `z.infer<typeof entitySchema>` in `src/entities/<entity>.ts`. See [`docs/domain-entities.md`](docs/domain-entities.md) and [`docs/adr/0001-domain-entity-schema-style.md`](docs/adr/0001-domain-entity-schema-style.md).
- Treat canonical domain entity schemas as the source of truth. Schemas and types elsewhere in the same domain, plus app/platform boundary schemas, should derive from or reuse the entity shapes whenever practical instead of re-declaring the same fields.
- When a boundary schema must differ materially from the entity shape, still reuse the relevant domain constants, field schemas, and literal unions rather than hardcoding duplicated lengths or sentinel values again.
- Domain entity schemas and their inferred entity types belong in `src/entities/<entity>.ts`.
- Domain package constants belong in `src/constants.ts`.
- Domain package errors belong in `src/errors.ts`.
- For **how** to structure those errors (tagged classes, HTTP fields, unions per flow, naming), treat `packages/domain/issues` as the reference: see `packages/domain/issues/src/errors.ts` and the section *Domain errors (`@domain/issues` reference pattern)* in `docs/issues.md`.
- Small domain-scoped shared helpers such as predicates or lifecycle helpers belong in `src/helpers.ts`.
- Schemas and types that exist only as inputs to one domain use-case should be defined in that use-case file. Only promote them into shared modules when several use-cases truly share the same contract.

## Repository method naming

- Standard verbs for domain repository ports: `findById`, `findByXxx` (unique lookup), `listByXxx` or `list` (collections), `save` (create/update), explicit `delete` vs `softDelete`, and specialized names for analytics (`aggregateBy*`, `countBy*`, etc.). Full rules, examples, and a port-by-port audit live in [docs/repositories.md](docs/repositories.md).

## Async Contract Scoping Convention

- Reliability domain-event payloads, queue topic/task payloads, and workflow inputs should include both `organizationId` and `projectId` by default so async execution remains project-scoped end-to-end.
- Explicit exceptions: the `domain-events` topic payload, the `magic-link-email` topic payload, the `invitation-email` topic payload, the `MagicLinkEmailRequested` domain event, the `InvitationEmailRequested` domain event, the `UserDeletionRequested` domain event, and the `user-deletion` topic payload do not require `projectId`.

<!-- domain-schema-and-module-conventions:end -->
