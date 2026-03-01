---
name: project-rules
description: Core project rules and patterns for writing code in this project. Load it any time you are about to write code, design a new feature, review changes or plan work on this project.
license: MIT
metadata:
  author: latitude
  version: "1.0.0"
---

# Skill: project-rules

Use this skill to keep implementation aligned with this repository's architecture and engineering standards.

## Purpose

Apply the platform's baseline rules when designing features, writing code, reviewing changes, and planning new integrations.

## Use this skill when

You are writing code, designing a new feature, reviewing changes, and planning work on this project.

## Required architecture checks

1. **Boundary check**
   - `apps/*` only validates/authenticates/authorizes/routes.
   - No business rules in endpoint or job handlers.

2. **DDD check**
   - Business logic stays in `packages/domain/*`.
   - Domain exposes use-cases, domain types, and dependency ports.

3. **Ports/adapters check**
   - Domain depends on interfaces/tags only.
   - Platform packages implement adapters.
   - Composition roots provide live layers.

4. **Data placement check**
   - Postgres for control-plane.
   - ClickHouse for telemetry.
   - Redis for queue/cache.

## Stack conventions

- Effect TS primitives for core code.
- Drizzle ORM for Postgres adapters.
- Hono for API and ingest boundaries.
- TanStack Start + React for web.
- Biome for lint/format.

## Output style for this skill

- Keep guidance concrete and repo-specific.
- Call out any deviation from `docs/project-rules-and-patterns.md`.
- Prefer minimal, explicit abstractions and YAGNI.

## Anti-patterns to reject

- Business logic inside handlers/controllers/jobs.
- Domain importing DB clients, Redis, BullMQ, or object storage SDKs.
- Cross-domain logic without clear ownership.
- New provider integrations without a core capability contract.

# Project Rules and Patterns

## Product and architecture scope

- Product: multi-tenant LLM observability platform.
- Monorepo: `pnpm` workspaces + `turbo`.
- Frontend: TanStack Start + React (`apps/web`).
- API and ingest boundaries: Hono (`apps/api`, `apps/ingest`).

## Non-negotiable architecture rules

- App boundaries only in `apps/*`:
  - validate input
  - authenticate and authorize
  - enforce workspace access
  - route to domain use-cases
- Business logic only in `packages/domain/*`.
- Infrastructure details only in `packages/platform/*`.
- Domain code must never import concrete DB/cache/queue/object storage clients.

## Multi-tenancy rules

- Every request is workspace-scoped.
- A user may belong to many workspaces.
- Workspace membership checks happen at boundaries before domain execution.
- All telemetry persistence and query paths include `workspaceId`.

## Data and infra model

- Postgres: control-plane and relational data (users, workspaces, memberships, config).
- ClickHouse: high-volume telemetry storage and analytical reads.
- Redis: cache and BullMQ backend.
- Object storage: durable raw ingest payload buffering.

## Database migrations (Drizzle Kit)

**Always use drizzle-kit for migrations.** Never create manual SQL files in the drizzle folder.

**Schema changes:**

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate
```

**Custom SQL (e.g., RLS policies, seed data):**

```bash
# Create custom migration for DDL not supported by Drizzle
npx drizzle-kit generate --custom --name=enable-rls

# This creates an empty SQL file in drizzle/ folder
# Edit the file with your custom SQL, then run:
npx drizzle-kit migrate
```

**Key points:**

- Use `drizzle-kit generate` for schema changes (creates timestamped migration)
- Use `drizzle-kit generate --custom` for custom SQL (RLS, triggers, seed data)
- Never manually create SQL files in the drizzle folder
- Use `IF NOT EXISTS` in custom SQL for idempotency
- Migrations are tracked in `drizzle.__drizzle_migrations` table

## Domain design (DDD)

- Organize by bounded context (e.g. telemetry, workspaces, identity, alerts).
- Domains expose:
  - use-cases
  - domain types/errors
  - ports (interfaces/tags for required dependencies)
- Domains should be single-responsibility and focused on policy/rules.

## Ports and adapters pattern

- Domain ports define required capabilities (`Repository`, `CacheStore`, `Publisher`, etc.).
- Platform adapters implement these ports.
- Composition roots in apps provide live layers.
- Use in-memory adapters for fast tests where possible.

## Side effects and eventing

- Domain logic emits domain events through domain-level publisher abstractions.
- Side effects (notifications, integrations, projections) are handled asynchronously by workers.
- Do not put side-effect orchestration inside HTTP handlers.

## Database patterns

- Postgres adapter stack uses Drizzle ORM in `packages/platform/db-postgres`.
- ClickHouse adapter stack remains SQL-oriented in `packages/platform/db-clickhouse`.
- Domain models are independent from table/row shapes.
- Mapping from DB rows to domain objects belongs in platform adapters.
- **Apps use pool-based connections**: Use `createPostgresPool()` in `apps/*/clients.ts` for direct pool access.

## Effect patterns

- Core code uses Effect TS primitives consistently.
- Prefer `Effect.gen` for sequential effect composition.
- Wrap promise-based APIs with `Effect.tryPromise` and typed errors.
- Use `Data.TaggedError` for domain-specific error types.
- Use `Effect.repeat` with `Schedule` for polling/recurring tasks instead of `setTimeout`.
- Use `Fiber` for lifecycle management of long-running effects.

## Application structure

- **Client initialization**: Centralize in `apps/*/clients.ts`, import where needed.
- **Routes**: Organize in `apps/*/routes/` with `registerRoutes()` pattern for extensibility.
- **Logging**: Use `createLogger()` from `@repo/observability` with service name.
- **Environment**: Use `parseEnv()` for required vars, `parseEnvOptional()` for optional vars.

## Error handling

- Prefer typed errors (`Data.TaggedError`) over raw `Error` or `unknown`.
- Use `Effect.either` for operations that may fail but shouldn't stop execution.
- Handle errors at boundaries; propagate through Effect error channel internally.

### HTTP Error Handling Pattern

Domain errors that need specific HTTP responses implement the `HttpError` interface:

```typescript
interface HttpError {
  readonly _tag: string;
  readonly httpStatus: number;
  readonly httpMessage: string;
}
```

**Implementation rules:**

1. Domain errors carry their own HTTP metadata (`httpStatus`, `httpMessage`)
2. Repositories return typed errors (e.g., `NotFoundError`) instead of null
3. Routes fail loudly - no try/catch, let errors propagate
4. Centralized error handling via `app.onError(honoErrorHandler)` in server.ts
5. Error middleware converts HttpError instances to appropriate HTTP responses

**Example domain error:**

```typescript
export class InvalidWorkspaceNameError extends Data.TaggedError(
  "InvalidWorkspaceNameError",
)<{
  readonly name: string;
  readonly reason: string;
}> {
  readonly httpStatus = 400;
  get httpMessage() {
    return this.reason;
  }
}
```

**Example repository method:**

```typescript
findById(id: WorkspaceId): Effect.Effect<Workspace, NotFoundError | RepositoryError>
```

## Testing strategy

- Write tests, mostly e2e, some unit tests when logic is complex.
- Unit tests: domain entities/use-cases/policies with fakes.
- Contract tests: adapter compliance against domain ports.
- Integration tests: infra-backed tests for Postgres/ClickHouse/Redis/BullMQ/object storage.
- End-to-end tests: ingest boundary to query boundary across workspace scoping.

## Adding new infrastructure dependencies

- Add a capability interface in `packages/platform/*-core`.
- Add concrete provider package in `packages/platform/*-<provider>`.
- Wire via app composition root and environment-driven config.
- Keep domain unchanged unless business behavior changes.

## Style and tooling

- Lint and format: Biome.
- Keep abstractions explicit and minimal.
- Prefer typed errors over untyped exceptions in core logic.
- Avoid comments except for genuinely non-obvious reasoning.
