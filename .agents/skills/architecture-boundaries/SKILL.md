---
name: architecture-boundaries
description: Layering and boundaries, web vs public API, app layout (clients, routes, logging), ports/adapters, runtime-portable domain/shared/utils code, multi-tenancy, DDD layout, or anti-patterns.
---

# Architecture and layer boundaries

**When to use:** Layering and boundaries, web vs public API, **app layout** (clients, routes, logging), ports/adapters, **runtime-portable domain/shared/utils code**, multi-tenancy, DDD layout, or anti-patterns.

## App boundaries (`apps/*`)

Apps only handle:

- Input validation
- Authentication and authorization
- Organization access enforcement
- Routing to domain use-cases

No business logic in handlers, controllers, or jobs.

## Application layout (`apps/*`)

- **Clients**: Initialize integrations in `apps/*/clients.ts` and import from boundaries — avoid scattering raw clients.
- **Routes**: Use `apps/*/routes/` with a `registerRoutes()` (or equivalent) pattern so the HTTP surface stays modular.
- **Logging**: Use `createLogger()` from `@repo/observability` with a stable service name per app.
- **Configuration values**: Read env through `parseEnv` / `parseEnvOptional` — see [env-configuration](../env-configuration/SKILL.md).

## Web vs public API (`apps/web` and `apps/api`)

- `apps/api` is the stable public API surface. Treat its routes/contracts as externally consumed and evolve them carefully.
- `apps/web` must not call or proxy through `apps/api` for internal product features.
- For web product development, implement backend behavior in `apps/web` server functions by composing domain use-cases and platform adapters directly.
- Keep iteration velocity in `apps/web` by adding web-private server functions/stores while preserving `apps/api` stability.
- Shared business rules still belong in domain packages; `apps/web` and `apps/api` should both orchestrate domain use-cases rather than duplicating policy.
- Latitude product capabilities should be equally accessible to humans through the web UI and to other LLM agents through MCP/API surfaces.
- Do not dead-end product behavior into UI-only flows. Preserve the boundary rules above, but design schemas, use-cases, and public capabilities so machine-facing access can exist without redesign.

## Cross-cutting implementation constraints

- Public request/response schemas should remain boundary-specific; they may reuse shared domain schemas or narrower projections rather than forcing full domain entities onto every surface.
- When a capability is part of the product contract, preserve a machine-facing MCP/API surface instead of making it web-only.

## Domain layer (`packages/domain/*`)

Business logic lives here. Domain packages expose:

- Use-cases
- Canonical entity schemas and inferred entity types
- Domain types and errors
- Dependency ports (interfaces/tags)

## Domain package layout

- Canonical entity schemas and their inferred entity types belong in `packages/domain/*/src/entities/<entity>.ts`.
- Domain package constants belong in `packages/domain/*/src/constants.ts`.
- Domain package errors belong in `packages/domain/*/src/errors.ts`. A full package-by-package inventory and import rules live in [`docs/domain-errors.md`](../../../docs/domain-errors.md).
- Small domain-scoped shared helpers such as predicates or lifecycle helpers belong in `packages/domain/*/src/helpers.ts`.
- Types and schemas that exist only as inputs to one domain use-case belong in that use-case file rather than a generic side module, unless several use-cases truly share the exact same contract.
- App and platform layers should build boundary-specific schemas by reusing or deriving from domain entity/use-case schemas whenever practical rather than redefining the same contract from scratch.

## Infrastructure (`packages/platform/*`)

Infrastructure details live here only. Platform packages implement adapters for domain ports.

### Platform adapters: Effect-based clients

**Reference implementation:** `packages/platform/db-weaviate/src/client.ts` — `createWeaviateClientEffect` (and the thin `createWeaviateClient` wrapper used by scripts).

Use this pattern when a platform package owns an external SDK client so composition roots can stay in Effect and errors stay typed.

1. **Primary constructor is an Effect** — Export `createXClientEffect(...): Effect.Effect<Client, E, never>` (or with requirements `R` if unavoidable). Scripts and one-off CLIs may export `async function createXClient()` as `Effect.runPromise(createXClientEffect(...))` only at the boundary that needs promises.
2. **Typed errors** — Model connection, validation, and bootstrap failures with `Data.TaggedError` (or shared env errors from `@platform/env`). Union them into a single `CreateXClientError` (or similar) exported next to the constructor.
3. **Configuration** — Resolve settings with `parseEnv` / `parseEnvOptional` from `@platform/env` inside the Effect pipeline, not ad hoc `process.env` reads scattered outside the client module.
4. **Interop** — Wrap promise-based SDK calls in `Effect.tryPromise` and map failures to tagged errors. Compose steps with `Effect.pipe`, `Effect.flatMap`, and `Effect.map`.
5. **Bootstrap in the pipeline** — If the client must apply schema/migrations/health checks before use, run those as Effects in the same pipeline (see Weaviate: `migrateWeaviateCollectionsEffect` after connect) so callers get a ready client or a single error channel.
6. **Live layers** — Expose `PortLive(client) => Layer.succeed(Port, implementation)` (or `Layer.effect` when the adapter holds fiber-scoped state). The composition root acquires the client with `createXClientEffect` and maps to the layer, for example `createWeaviateClientEffect().pipe(Effect.map((c) => IssueProjectionRepositoryLive(c)))` in `apps/workflows/src/clients.ts`.

Not every legacy adapter has been migrated; prefer this shape for new work and when touching client construction.

## Shared utilities (`packages/utils`)

General-purpose utility functions that can be shared across any package (domain, platform, or app) live in `@repo/utils`. This package should contain pure, stateless helper functions with no domain or infrastructure dependencies.

Examples: `formatCount`, `formatPrice`, string helpers, number formatters.

When writing a utility function that is not specific to a single domain or package, place it in `@repo/utils` instead of keeping it local.

## Shared domain vs utils

`@domain/shared` and `@repo/utils` have different responsibilities and should not be merged.

- Use `@domain/shared` for domain-level shared contracts, types, errors, and IDs used across bounded contexts.
- Use `@repo/utils` for global pure, stateless helpers that are reusable anywhere.
- If a helper has domain/business meaning, it belongs in `@domain/shared`; otherwise, use `@repo/utils`.

## Ports and adapters

- Domain depends on interfaces/tags only (ports like `Repository`, `CacheStore`, `Publisher`)
- Platform packages implement adapters
- Composition roots in apps provide live layers
- Domain must never import concrete DB/cache/queue/object storage clients
- **Repository method names:** Use the standard verbs in [docs/repositories.md](../../../docs/repositories.md) (`findById`, `findByXxx` for unique keys, `listByXxx` / `list` for collections, `save`, `delete` vs `softDelete`, etc.).
- Reliability async contracts should stay project-scoped as well as organization-scoped: include both `organizationId` and `projectId` in event/task/workflow payloads by default (except `MagicLinkEmailRequested`, `UserDeletionRequested`, `domain-events`, `magic-link-email`, and `user-deletion` payloads).

## Web standards first (domain, utils, shared)

In `packages/domain/*`, `packages/utils`, `@domain/shared`, or any code that may run outside Node (browser, edge, isolates), prefer **Web Standard APIs** over Node-only modules so those layers stay portable.

- Use `crypto.subtle` / `crypto.getRandomValues` instead of `node:crypto`
- Use `fetch` instead of Node-specific HTTP clients
- Use `TextEncoder` / `TextDecoder` instead of `Buffer.from(…, 'utf-8')`
- Use `Uint8Array` for binary data in public interfaces
- Use `ReadableStream` instead of `node:stream` / `node:fs` streams
- Use `URL`, `URLSearchParams`, `Headers`, `Request`, `Response` from the global scope
- Use `structuredClone` instead of JSON round-trips for deep cloning

**Node-only APIs are acceptable** in build tooling, scripts, CLI utilities, and test infrastructure. If you need Node outside those scopes, add a brief comment explaining why.

## Data and infrastructure (overview)

- **Postgres**: Control-plane and relational data (users, organizations, memberships, config)
- **ClickHouse**: High-volume telemetry storage and analytical reads
- **Weaviate**: Vector database for embeddings storage and semantic similarity search
- **Redis**: Cache and BullMQ backend
- **Object storage**: Durable raw ingest payload buffering

For access patterns, schema, and migrations, see [database-postgres](../database-postgres/SKILL.md) and [database-clickhouse-weaviate](../database-clickhouse-weaviate/SKILL.md).

## Multi-tenancy

- Every request is organization-scoped
- A user may belong to many organizations
- Organization membership checks happen at boundaries before domain execution
- All telemetry persistence and query paths include `organizationId`

## Domain design (DDD)

- Organize by bounded context (e.g. telemetry, organizations, identity, alerts)
- Domains should be single-responsibility and focused on policy/rules
- Use in-memory adapters for fast tests where possible

## Anti-patterns to reject

- Cross-domain logic without clear ownership
- New provider integrations without a core capability contract
- Introducing application env vars without the `LAT_` prefix (see [env-configuration](../env-configuration/SKILL.md))
- Using `"use client"` or `"use server"` directives — these are Next.js-specific; the web app uses TanStack Start
- Exporting test utilities from a package's main entry point (see [testing](../testing/SKILL.md))
