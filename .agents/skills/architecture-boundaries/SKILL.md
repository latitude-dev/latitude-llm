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

## Domain layer (`packages/domain/*`)

Business logic lives here. Domain packages expose:

- Use-cases
- Domain types and errors
- Dependency ports (interfaces/tags)

## Infrastructure (`packages/platform/*`)

Infrastructure details live here only. Platform packages implement adapters for domain ports.

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
