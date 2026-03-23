# AGENTS.md

Operational guide for coding agents working in this repository.

## Product Scope

Multi-tenant LLM observability platform. Monorepo managed with `pnpm` workspaces + `turbo`.

## Architecture Rules

### App Boundaries (`apps/*`)

Apps only handle:

- Input validation
- Authentication and authorization
- Organization access enforcement
- Routing to domain use-cases

No business logic in handlers, controllers, or jobs.

### Web vs Public API Boundary (`apps/web` and `apps/api`)

- `apps/api` is the stable public API surface. Treat its routes/contracts as externally consumed and evolve them carefully.
- `apps/web` must not call or proxy through `apps/api` for internal product features.
- For web product development, implement backend behavior in `apps/web` server functions by composing domain use-cases and platform adapters directly.
- Keep iteration velocity in `apps/web` by adding web-private server functions/stores while preserving `apps/api` stability.
- Shared business rules still belong in domain packages; `apps/web` and `apps/api` should both orchestrate domain use-cases rather than duplicating policy.
- Latitude product capabilities should be equally accessible to humans through the web UI and to other LLM Agents through MCP/API surfaces.
- Do not dead-end product behavior into UI-only flows. Preserve the boundary rules above, but design schemas, use-cases, and public capabilities so machine-facing access can exist without redesign.

### Cross-Cutting Implementation Constraints

In addition to the boundary rules above:

- For new domain data contracts, define the canonical shared shape as a Zod schema first when runtime validation is required, then infer TypeScript types from that schema or from Drizzle schemas where appropriate.
- Enum-like contracts should use literal-string unions or `as const` objects, not TypeScript enums.
- Shared domain schemas should validate data crossing from app/platform boundaries into domain use-cases.
- Public request/response schemas should remain boundary-specific; they may reuse shared domain schemas or narrower projections rather than forcing full domain entities onto every surface.
- Configurable thresholds, weights, debounce windows, sentinel values, and similar tunables should live in named constants inside the owning domain package rather than as scattered inline literals.
- New Postgres tables must not add foreign key constraints.
- Organization-scoped Postgres tables must use the repository RLS conventions.
- When a capability is part of the product contract, preserve a machine-facing MCP/API surface instead of making it web-only.

### Domain Layer (`packages/domain/*`)

Business logic lives here. Domain packages expose:

- Use-cases
- Domain types and errors
- Dependency ports (interfaces/tags)

### Infrastructure (`packages/platform/*`)

Infrastructure details live here only. Platform packages implement adapters for domain ports.

### Shared Utilities (`packages/utils`)

General-purpose utility functions that can be shared across any package (domain, platform, or app) live in `@repo/utils`. This package should contain pure, stateless helper functions with no domain or infrastructure dependencies.

Examples: `formatCount`, `formatPrice`, string helpers, number formatters.

When writing a utility function that is not specific to a single domain or package, place it in `@repo/utils` instead of keeping it local.

### Shared Domain vs Utils

`@domain/shared` and `@repo/utils` have different responsibilities and should not be merged.

- Use `@domain/shared` for domain-level shared contracts, types, errors, and IDs used across bounded contexts.
- Use `@repo/utils` for global pure, stateless helpers that are reusable anywhere.
- If a helper has domain/business meaning, it belongs in `@domain/shared`; otherwise, use `@repo/utils`.

### Ports and Adapters

- Domain depends on interfaces/tags only (ports like `Repository`, `CacheStore`, `Publisher`)
- Platform packages implement adapters
- Composition roots in apps provide live layers
- Domain must never import concrete DB/cache/queue/object storage clients

### Data and Infrastructure

- **Postgres**: Control-plane and relational data (users, organizations, memberships, config)
- **ClickHouse**: High-volume telemetry storage and analytical reads
- **Weaviate**: Vector database for embeddings storage and semantic similarity search
- **Redis**: Cache and BullMQ backend
- **Object storage**: Durable raw ingest payload buffering

### Multi-tenancy

- Every request is organization-scoped
- A user may belong to many organizations
- Organization membership checks happen at boundaries before domain execution
- All telemetry persistence and query paths include `organizationId`

### Web Standards First

Prefer Web Standard APIs over Node.js-specific modules in domain, utility, and shared packages. Code in these layers may run in browsers, edge runtimes (Cloudflare Workers, Deno Deploy), or embedded V8 isolates — not just Node.js. Using platform-agnostic APIs maximises the compatibility surface without sacrificing functionality.

**Practical guidelines:**

- Use `crypto.subtle` / `crypto.getRandomValues` instead of `node:crypto`
- Use `fetch` instead of Node-specific HTTP clients
- Use `TextEncoder` / `TextDecoder` instead of `Buffer.from(…, 'utf-8')`
- Use `Uint8Array` for binary data in public interfaces
- Use `ReadableStream` instead of `node:stream` / `node:fs` streams
- Use `URL`, `URLSearchParams`, `Headers`, `Request`, `Response` from the global scope
- Use `structuredClone` instead of JSON round-trips for deep cloning

**Where Node-specific APIs are acceptable:**

- Build tooling, scripts, and CLI utilities (e.g. `node:fs`, `node:child_process`)
- Test infrastructure (e.g. `node:test` in test helpers)

When a Node-specific API is genuinely required outside these scopes, document the reason with a brief comment.

### Test Code Isolation

Test utilities (fakes, in-memory databases, fixtures) must never be exported from a package's main entry point (`src/index.ts`). Doing so pulls test-only code into production bundles.

**Rules:**

- **Never** export from `./test/` or `./testing/` directories in a package's main `src/index.ts`
- If a package needs to expose test utilities, add a `/testing` subpath in `package.json` `exports`:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/my-test-helpers.ts"
  }
}
```

- Test consumers import via the subpath: `import { Fake } from "@platform/my-package/testing"`
- Biome enforces this with `noRestrictedImports` (errors on `./test/*` and `./testing/*` imports in production source)
- Production bundlers (tsup) include an esbuild plugin that fails the build if test code is resolved

### Test Code Isolation

Test utilities (fakes, in-memory databases, fixtures) must never be exported from a package's main entry point (`src/index.ts`). Doing so pulls test-only code into production bundles.

**Rules:**

- **Never** export from `./test/` or `./testing/` directories in a package's main `src/index.ts`
- If a package needs to expose test utilities, add a `/testing` subpath in `package.json` `exports`:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/my-test-helpers.ts"
  }
}
```

- Test consumers import via the subpath: `import { Fake } from "@platform/my-package/testing"`
- Biome enforces this with `noRestrictedImports` (errors on `./test/*` and `./testing/*` imports in production source)
- Production bundlers (tsup) include an esbuild plugin that fails the build if test code is resolved

### Anti-patterns to Reject

- Cross-domain logic without clear ownership
- New provider integrations without a core capability contract
- Introducing application env vars without the `LAT_` prefix (see Environment Variables)
- Using `"use client"` or `"use server"` directives — these are Next.js-specific; the web app uses TanStack Start
- Exporting test utilities from a package's main entry point (see Test Code Isolation)
- Exporting test utilities from a package's main entry point (see Test Code Isolation)

### Documentation and Specs

- `docs/` contains precise and exhaustive Markdown documentation for each domain or system.
- Each docs file should cover how the domain or system is architected, built, designed, and structured.
- Keep docs organized by domain/system (for example: `docs/reliability.md`, `docs/evaluations.md`, `docs/annotations.md`, `docs/scores.md`, `docs/issues.md`, `docs/simulations.md`, `docs/organizations.md`, `docs/projects.md`, `docs/users.md`, `docs/settings.md`, `docs/spans.md`).
- `specs/` is a temporary folder used while a feature or system is under construction.
- Each spec/PRD in `specs/` should have its own Markdown file and usually include a task list to track progress (for example: `specs/reliability.md`).
- Specs define exactly what/how/why to build while the feature is under construction, so temporary overlap with docs is acceptable.
- Docs should describe the intended final system after all planned phases are complete, including post-MVP phases, precisely enough to remain authoritative after the corresponding spec is deleted.
- Docs should not be written as a snapshot of the repository's currently implemented state.
- If some part of the final design is still not fully specified, docs may say that the exact detail is still pending precise definition, but they should still be framed around the final intended system.
- When working on a spec, the coding agent should proactively ask the user clarifying questions and challenge assumptions, gaps, ambiguities, and trade-offs as needed to build the best possible spec.
- Specs should follow this structure:

```markdown
# Name

> **Documentation**: `docs/reliability.md`, `docs/evaluations.md`, ...

... (here goes the exact and precise specification and the plan)

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase N - ...

- [ ] **P0-1**: ...

... (here goes more tasks)

**Exit gate**:

- ... (here goes the definition of complete for this phase)

... (here goes more phases)
```

- Each Phase should be a GitHub PR by itself, each task inside is a subtask of that PR.
- When implementation stabilizes, promote durable knowledge from `specs/` into `docs/`.
- Building the related `docs/` for the current spec is recommended.
- Optionally each Phase could be linked to a Linear task if configured by the user.

### Documentation Sync

When a task introduces, removes, or clarifies durable repository knowledge, the coding agent must read and follow `.agents/skills/docs/SKILL.md` before finalizing.

This includes changes to:

- product behavior
- business logic
- architecture or design
- repository structure or ownership
- schema, API, storage, query, or lifecycle behavior
- conventions, constraints, or prohibitions agreed during the conversation

The agent must:

- use the current conversation as the filter for what belongs to the current session
- inspect the current git changes as evidence
- update the relevant `docs/*.md` files by domain
- update `AGENTS.md` when the session establishes a new repo-wide durable rule
- explicitly say when no durable documentation update is needed

## Stack and Toolchain

- **Runtime**: Node.js `>=25` (see root `package.json`). Check if mise is installed and use mise to switch to found node version. If Mise is not found ignore this.
- **Package manager**: check `package.json` `packageManager` field (e.g. `pnpm` 10.30.0). Install deps: `pnpm install`
- **Task runner**: `turbo` via root scripts
- **Lint/format**: Biome (`@biomejs/biome` 1.9.x)
- **Tests**: Vitest 3.x
- **Core logic**: Effect TS primitives
- **Postgres ORM**: Drizzle
- **API/ingest boundaries**: Hono
- **Web app**: TanStack Start + React

## Commands

### Top-Level (run from repo root)

- `pnpm dev` - run all workspace `dev` tasks via Turbo
- `pnpm build` - run all workspace builds
- `pnpm check` - run all workspace lint and format check scripts
- `pnpm typecheck` - run all workspace typechecks
- `pnpm test` - run all workspace tests
- `pnpm hooks` - configure local git hooks for this clone

### Git Hooks (Pre-commit)

- Pre-commit hook lives at `.husky/pre-commit`
- Pre-commit runs: `pnpm check`, `pnpm typecheck`, and `pnpm knip`
- Hooks are auto-configured on dependency install via root `prepare` script (`pnpm hooks`)
- Existing clones should run `pnpm hooks` once to configure `core.hooksPath` and hook permissions

### Package-Scoped (use `--filter`)

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

### Single-Test Workflows

Vitest is invoked as `vitest run --passWithNoTests`:

```bash
# Single test file
pnpm --filter @app/api test -- src/some-file.test.ts

# Test name pattern
pnpm --filter @app/api test -- -t "health endpoint"

# Specific file + name
pnpm --filter @app/api test -- src/some-file.test.ts -t "returns 200"
```

## CI-Equivalent Local Checks

Before opening PRs:

```bash
pnpm check
pnpm typecheck
pnpm test
```

CI workflows (`check.yml`, `typecheck.yml`, `knip.yml`, `test.yml`) use Node 25 + pnpm and run the same commands.

## Code Style

Biome config (`biome.json`) is the source of truth:

- Indentation: 2 spaces
- Max line width: 120
- Strings: double quotes
- Semicolons: as needed
- Ignore generated/output paths: `dist/**`, `coverage/**`, `.turbo/**`, `node_modules/**`, `**/*.gen.ts`, `**/models.dev.json`
- Prefer package-local formatting: `pnpm --filter @app/api format`

### Imports

- Prefer static imports; avoid dynamic import patterns unless justified
- Use `import type { ... }` for type-only imports
- Keep imports explicit and grep-friendly
- Preserve clear grouping/order (external, internal alias, then relative)
- Avoid wildcard exports/imports when explicit named exports are practical
- Avoid barrel files (index.ts re-exporting from the same directory); import from the specific module
- **Use `.ts`/`.tsx` extensions** in relative imports (not `.js`). The codebase uses TypeScript source extensions for module resolution

### TypeScript

Base config: `tsconfig.base.json`

- `strict: true` is enabled; keep code strict-clean
- Module system: `NodeNext` + ESM (`"type": "module"` in packages/apps)
- For new domain data contracts, define the canonical shared shape as a Zod schema first when runtime validation is required, then infer TypeScript types from that schema or from Drizzle schemas where appropriate.
- Use shared domain schemas to validate data crossing from app/platform boundaries into domain use-cases.
- Public request/response schemas remain boundary-specific; they may reuse shared domain schemas or narrower projections of them instead of forcing full domain entities onto every surface.
- Prefer explicit domain types/interfaces over loose objects
- Methods/functions with more than one argument should default to a single named-arguments object rather than positional arguments
- Use `readonly` fields for immutable domain data shapes
- Avoid `any`; use `unknown` + narrowing
- Avoid unnecessary type assertions (`as { ... }`); prefer relying on inferred types from libraries
- Validate boundary inputs early (API input, queue payloads, external IO)

### General Principles

- Prefer minimal, explicit abstractions — YAGNI
- Avoid comments except for genuinely non-obvious reasoning

### Naming Conventions

- Types/interfaces/classes: `PascalCase`
- Variables/functions/methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE` only for true constants; otherwise `camelCase` + `as const`
- File names favor concise module roots (`src/index.ts`, `src/server.ts`, `src/main.tsx`)
- React component files use **kebab-case**: `my-component.tsx` or `my-component/index.tsx` — never `PascalCase` file names (e.g. `MyComponent.tsx`). This matches the `@repo/ui` convention (`table-skeleton.tsx`, `form-field.tsx`, etc.)
- Package names follow scoped workspace style (`@app/*`, `@domain/*`, etc.)

### Domain Design (DDD)

- Organize by bounded context (e.g. telemetry, organizations, identity, alerts)
- Domains should be single-responsibility and focused on policy/rules
- Use in-memory adapters for fast tests where possible

## Database Patterns

- Postgres adapter stack uses Drizzle ORM in `packages/platform/db-postgres`
- ClickHouse adapter stack remains SQL-oriented in `packages/platform/db-clickhouse`. **All ClickHouse queries must use parameterized bindings** (`{name:Type}` syntax with `query_params`) — never interpolate user-supplied values directly into SQL strings. **All ClickHouse queries must use parameterized bindings** (`{name:Type}` syntax with `query_params`) — never interpolate user-supplied values directly into SQL strings
- Weaviate adapter stack lives in `packages/platform/db-weaviate`
- Domain models are independent from table/row shapes
- Mapping from DB rows to domain objects belongs in platform adapters
- **Apps use SqlClient for all DB access**: Boundaries provide `SqlClientLive` layer with organization context for RLS enforcement

### SqlClient and Row-Level Security (RLS)

All Postgres access flows through `SqlClient`—a domain-level service that abstracts database operations and enforces organization scoping via RLS.

**Architecture:**

- **Domain Layer** (`@domain/shared`): `SqlClient` interface with `transaction()` and `query()` methods
- **Platform Layer** (`@platform/db-postgres`): `SqlClientLive` implementation with automatic RLS context setting
- **App Layer** (`apps/*`): Boundaries provide `SqlClientLive` with the request's organization context

**Key behaviors:**

- Every transaction automatically sets `app.current_organization_id` session variable
- RLS policies filter all queries by this organization ID at the database level
- Nested transactions share the same connection (pass-through proxy—no nested transaction overhead)
- Domain errors propagate through Effect error channel; database errors become `RepositoryError`

**Usage in boundaries (apps):**

```typescript
// apps/api/src/routes/projects.ts
import { SqlClientLive } from "@platform/db-postgres";
import { ProjectRepositoryLive } from "@platform/db-postgres";

app.openapi(createProjectRoute, async (c) => {
  const project = await Effect.runPromise(
    createProjectUseCase(input).pipe(
      Effect.provide(ProjectRepositoryLive),
      Effect.provide(SqlClientLive(c.var.postgresClient, c.var.organization.id)),
    ),
  );
  return c.json(toProjectResponse(project), 201);
});
```

```typescript
// apps/web/src/domains/projects/projects.functions.ts
import { getPostgresClient } from "../../server/clients.ts"

export const createProject = createServerFn({ method: "POST" })
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      createProjectUseCase({...}).pipe(
        Effect.provide(ProjectRepositoryLive),
        Effect.provide(SqlClientLive(client, organizationId)),
      )
    )
    return toRecord(project)
  })
```

**Usage in use-cases (multi-operation transactions):**

```typescript
// packages/domain/auth/src/use-cases/complete-auth-intent.ts
export const completeAuthIntentUseCase = (input) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient

    // Wraps multi-step operation in single transaction with RLS
    yield* sqlClient.transaction(handleIntentByType(intent, input.session))
  })

const handleSignup = (intent, session) =>
  Effect.gen(function* () {
    const users = yield* UserRepository
    const memberships = yield* MembershipRepository

    // All operations share the same transaction + RLS context
    const organization = yield* createOrganizationUseCase({...})
    yield* memberships.save(createMembership({...}))
    yield* users.setNameIfMissing({...})
  })
```

**Usage in repositories (single operations):**

```typescript
// packages/platform/db-postgres/src/repositories/project-repository.ts
export const ProjectRepositoryLive = Layer.effect(
  ProjectRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (id) =>
        sqlClient
          .query((db) => db.select().from(projects).where(eq(projects.id, id)))
          .pipe(Effect.flatMap(...)),

      save: (project) =>
        Effect.gen(function* () {
          yield* sqlClient.query((db) =>
            db.insert(projects).values(row).onConflictDoUpdate({...})
          )
        }),
    }
  })
)
```

### Postgres Management

Connect to the development database directly:

```bash
docker compose exec postgres psql -U latitude -d latitude_development
```

To reset only the Postgres volume and start fresh (without affecting other services):

```bash
pnpm --filter @platform/db-postgres pg:reset
```

This runs `docker/reset-postgres.sh` which stops postgres, removes the `data-llm_postgres_data` volume, restarts postgres, waits for it to be ready, runs migrations, and seeds the database.

### Postgres Schema Conventions

All Drizzle table definitions in `packages/platform/db-postgres/src/schema/` **must** follow these rules. Shared helpers live in `schemaHelpers.ts`.

1. **Use `latitudeSchema`** — never create a local `pgSchema("latitude")`. Import `latitudeSchema` from `../schemaHelpers.ts`.
2. **Use `cuid("id").primaryKey()`** — every table's primary key must use the `cuid()` helper (`varchar(24)` with auto-generated CUID2).
3. **Use `tzTimestamp(name)`** — never use raw `timestamp(name, { withTimezone: true })`. Import `tzTimestamp` from the helpers.
4. **Use `...timestamps()`** — every table that has `createdAt`/`updatedAt` must spread the `timestamps()` helper (includes `$onUpdateFn` on `updatedAt`).
5. **Use `organizationRLSPolicy(tableName)`** — every table with an `organization_id` column must include this helper in its third argument to enable row-level security.
6. **No foreign keys** — do not use `.references()` or manually create `FOREIGN KEY` constraints. Referential integrity is enforced at the application/domain layer. FK constraints cause lock contention on high-write tables, complicate zero-downtime migrations, and conflict with soft-delete patterns. Use indexes on relationship columns instead (e.g. `index().on(t.datasetId)` rather than `.references(() => datasets.id)`).

```typescript
// ✅ Good - follows all conventions
export const projects = latitudeSchema.table(
  "projects",
  {
    id: cuid("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  () => [organizationRLSPolicy("projects")],
);
```

### Database Migrations (Drizzle Kit)

### Migration Execution Safety (Agents)

- Agents must not run migration commands on their own.
- Only run migration-related commands when the user explicitly requests them in the current conversation.
- This includes generation and apply commands for Postgres, ClickHouse, and Weaviate (`pg:generate`, `pg:generate:custom`, `pg:migrate`, `ch:create`, `ch:up`, `ch:down`, `ch:drop`, `ch:reset`, `ch:fix`, `wv:migrate`).
- If migration work seems necessary but was not explicitly requested, explain the need and wait for user confirmation.

**Always use drizzle-kit for migrations.** Never create manual SQL files in the drizzle folder.

**Schema changes:**

```bash
# Generate migration from schema changes
pnpm --filter @platform/db-postgres pg:generate "<name>"

# Create empty migration for custom SQL (RLS policies, seed data, etc.)
pnpm --filter @platform/db-postgres pg:generate:custom "<name>"

# Apply migrations
pnpm --filter @platform/db-postgres pg:migrate
```

**Key points:**

- Name is slugified automatically; always quote multi-word names (e.g. `"add users table"` → `add-users-table`)
- Postgres migration history is append-only in this repository. Do not edit existing Drizzle migration files; change the schema and generate a new migration instead.
- For additive Postgres changes to existing tables, prefer ordinary generated `ALTER TABLE` migrations over bespoke backfill choreography unless the change truly requires data rewriting.
- Never manually create SQL files in the drizzle folder
- Use `IF NOT EXISTS` in custom SQL for idempotency
- Migrations are tracked in `drizzle.__drizzle_migrations` table

### ClickHouse Migrations (Goose)

**Install goose** (if not already installed):

```bash
brew install goose
```

Migration files live in `packages/platform/db-clickhouse/clickhouse/migrations/`:

- `unclustered/` — single-node deployments (local dev, default)
- `clustered/` — distributed deployments (`CLICKHOUSE_CLUSTER_ENABLED=true`)

Goose tracks applied migrations automatically in the `goose_db_version` table (no manual registry).

**Commands (run from repo root):**

```bash
# Apply all pending migrations
pnpm --filter @platform/db-clickhouse ch:up

# Roll back last migration
pnpm --filter @platform/db-clickhouse ch:down

# Show migration status
pnpm --filter @platform/db-clickhouse ch:status

# Create a new migration (creates timestamp-named files in both unclustered/ and clustered/)
pnpm --filter @platform/db-clickhouse ch:create <migration_name>

# Convert timestamp migrations to sequential order (run before merging a PR)
pnpm --filter @platform/db-clickhouse ch:fix

# Roll back ALL migrations (equivalent to drop)
pnpm --filter @platform/db-clickhouse ch:drop

# Reset ClickHouse volume and re-migrate (nuclear option)
pnpm --filter @platform/db-clickhouse ch:reset

# Seed sample span data
pnpm --filter @platform/db-clickhouse ch:seed
```

**Creating migrations (hybrid versioning):**

Goose hybrid versioning lets developers create migrations independently using timestamps, then normalises them to sequential order before merging. This avoids version conflicts when multiple branches add migrations concurrently.

Workflow:

1. `ch:create <name>` — creates `20260305120000_name.sql` in both `unclustered/` and `clustered/`
2. Fill in both files (see rules below)
3. Before merging the PR, run `ch:fix` — renames timestamp files to the next sequential number (e.g. `00002_name.sql`) and commits the renamed files

**Migration file rules:**

- Each migration is a single `.sql` file with `-- +goose Up` and `-- +goose Down` sections
- Always include `-- +goose NO TRANSACTION` (ClickHouse does not support transactions)
- ClickHouse migration history is append-only in this repository. Do not edit existing Goose migration files; add a new migration in both `unclustered/` and `clustered/` instead.
- For additive ClickHouse changes to existing tables, prefer ordinary `ALTER TABLE` / additive projection migrations with sensible defaults unless the change truly requires a table rebuild.
- `unclustered/`: use standard table engines (e.g. `ReplacingMergeTree`)
- `clustered/`: add `ON CLUSTER default` and use `Replicated*` engines

### Weaviate Collections and Migrations

Use the dedicated Weaviate package for connection and schema bootstrapping:

- **Connection API:** `packages/platform/db-weaviate/src/client.ts`
  - `createWeaviateClient()` and `createWeaviateClientEffect()` connect and perform health checks.
- **Collection definitions:** `packages/platform/db-weaviate/src/collections.ts`
  - Define all collections in code via `defineWeaviateCollections([...])`.
- **Migration logic:** `packages/platform/db-weaviate/src/migrations.ts`
  - Migrations are idempotent: checks `collections.exists()` before create and tolerates "already exists" race conditions.
- **Manual migration command:** `pnpm --filter @platform/db-weaviate wv:migrate`
  - Entrypoint is `packages/platform/db-weaviate/src/migrate.ts`.

Rules:

- Do not define Weaviate collections in app/domain packages.
- Do not add ad-hoc Weaviate migration scripts outside `packages/platform/db-weaviate`.
- Keep collection schema changes centralized in `src/collections.ts` and rely on the package migration flow.

### Mapper Conventions

When writing `toDomain*` and `toInsertRow` functions in platform repositories:

- **Never hardcode field values.** Every field on the domain entity must be read from the DB row (`row.fieldName`), not assigned a literal (`null`, `""`, `new Date()`). If a field has no backing column, that is a schema gap — add the column or remove the field from the domain type.
- **Never use `as EntityType` casts** on mapper return values. These bypass TypeScript's structural check and hide type mismatches. Let the return type be inferred or explicitly annotated — the compiler will catch missing or incompatible fields.
- **Never coerce nullable columns** with `?? fallback` to satisfy a non-nullable domain type. Surface the mismatch: either make the column `notNull()` or make the domain field nullable.
- **`toInsertRow` must round-trip.** Every field written by `toInsertRow` should be readable by `toDomain*`, and vice versa. A field present in the domain type but absent from `toInsertRow` means data is silently discarded on write.

## Effect Patterns

- Prefer `Effect.gen` for sequential effect composition
- Wrap promise-based APIs with `Effect.tryPromise` and typed errors
- Use `Data.TaggedError` for domain-specific error types
- Use `Effect.repeat` with `Schedule` for polling/recurring tasks
- Use `Fiber` for lifecycle management of long-running effects

## Error Handling

- Always use typed errors (`Data.TaggedError`) instead of raw `Error` at domain/platform boundaries
- Use `Effect.either` for operations that may fail but shouldn't stop execution
- Handle errors at boundaries; propagate through Effect error channel internally
- Every domain error must implement the `HttpError` interface (`httpStatus` and `httpMessage`) — no exceptions. Even if the error doesn't currently reach an HTTP boundary, that boundary may change. Use a readonly field for static messages and a getter for messages computed from error fields.

### HTTP Error Handling Pattern

All domain errors implement the `HttpError` interface from `@repo/utils`:

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

**Example domain errors:**

```typescript
// Static message
export class QueuePublishError extends Data.TaggedError("QueuePublishError")<{
  readonly cause: unknown;
  readonly queue: QueueName;
}> {
  readonly httpStatus = 502;
  readonly httpMessage = "Queue publish failed";
}

// Dynamic message computed from fields
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: string;
  readonly id: string;
}> {
  readonly httpStatus = 404;
  get httpMessage() {
    return `${this.entity} not found`;
  }
}
```

**Example repository method:**

```typescript
findById(id: OrganizationId): Effect.Effect<Organization, NotFoundError | RepositoryError>
```

## Side Effects and Eventing

- Domain logic emits domain events through domain-level publisher abstractions
- Side effects (notifications, integrations, projections) are handled asynchronously by workers
- Do not put side-effect orchestration inside HTTP handlers

## Generated Files

- `apps/web/src/routeTree.gen.ts` is auto-generated by TanStack Router — do not manually edit
- Generated files may be regenerated during builds or dev server runs; commit them when they change but do not modify by hand

## Authentication (Better Auth)

- Auth is configured via `@platform/auth-better` which wraps the `better-auth` library
- `createBetterAuth()` in `packages/platform/auth-better/src/index.ts` is the factory
- Sessions are retrieved via `auth.api.getSession({ headers })` — returns `{ user, session }` with typed fields
- The `User` type from Better Auth includes `id`, `email`, `name` — access these fields directly without type assertions
- Session helpers live in `apps/web/src/domains/sessions/session.functions.ts` (`getSession`, `ensureSession`)
- Organization context is injected into sessions via the `customSession` plugin
- Auth intent flow (login/signup) uses domain use-cases from `@domain/auth` composed with Postgres repositories

## Application Structure

- **Client initialization**: Centralize in `apps/*/clients.ts`, import where needed
- **Routes**: Organize in `apps/*/routes/` with `registerRoutes()` pattern for extensibility
- **Logging**: Use `createLogger()` from `@repo/observability` with service name
- **Environment**: Use `parseEnv()` for required vars, `parseEnvOptional()` for optional vars

### Environment Variables

#### `LAT_` Prefix Convention

All application environment variables **must** be prefixed with `LAT_` to avoid name collisions with third-party services, Docker containers, and standard conventions.

**What gets the `LAT_` prefix:**

- Database connection strings and pool config (`LAT_DATABASE_URL`, `LAT_PG_POOL_MAX`, ...)
- Service connection details our code reads (`CLICKHOUSE_URL`, `LAT_REDIS_HOST`, ...)
- Application ports (`LAT_API_PORT`, `LAT_WEB_PORT`, `LAT_INGEST_PORT`)
- Auth, email, OAuth, Stripe, CORS config (`LAT_BETTER_AUTH_SECRET`, `LAT_MAILPIT_HOST`, ...)
- Any new env var introduced for Latitude application code

**What does NOT get the `LAT_` prefix:**

- `NODE_ENV` — standard Node.js convention, used by many libraries
- Docker service init vars (`POSTGRES_USER`, `CLICKHOUSE_USER`, ...) — required by container images
- Weaviate, Redis, and other service-specific config consumed only by Docker
- Vite client-side vars use the combined prefix `VITE_LAT_*` (Vite requires `VITE_` for browser exposure)

**Reference:** See `.env.example` for the full list of current variables split into "Services" (Docker) and "Latitude Application" (`LAT_*`) sections.

#### `.env.example` Maintenance

Every new environment variable **must** be added to `.env.example`:

- **Required vars**: add uncommented with a sensible local-development default (e.g. `LAT_API_PORT=3001`).
- **Optional vars**: add commented out so the user can uncomment when needed (e.g. `# LAT_STRIPE_SECRET_KEY=sk_test_xxx`).

This keeps `.env.example` the single source of truth for all configuration the project supports.

#### Parsing

**Always** use `parseEnv` or `parseEnvOptional` from `@platform/env`:

```typescript
// ❌ Bad - unprefixed variable or direct access
const port = Number(process.env.PORT);

// ✅ Good - LAT_ prefix + parseEnv (pass variable name, not process.env value)
import { parseEnv, parseEnvOptional } from "@platform/env";
import { Effect } from "effect";

const port = Effect.runSync(parseEnv("LAT_API_PORT", "number", 3001));
const dbUrl = Effect.runSync(parseEnv("LAT_DATABASE_URL", "string"));
```

`parseEnv` looks up `process.env[name]` internally, so pass the variable **name** as a string. This ensures type-safe parsing, clear error messages that include the missing variable name, and consistent validation.

## Async and Background Task Guidance

- Async jobs and queue payloads must never carry full mutable entities; pass ids or opaque storage keys instead
- Re-fetch current state inside task handlers before acting
- Make stale/deleted entity behavior explicit
- When BullMQ delay is the chosen debounce mechanism, key the delayed job by the logical entity identity so newer writes replace or reschedule the pending job
- When a delayed queue topic semantically marks a lifecycle edge, let the delayed task publish a domain event through the outbox after the delay elapses; downstream side effects should run from the domain-event consumers rather than inline in the delayed task

## Cloud Agent Environment Setup

**Before starting any work**, always ensure `.env.development` and `.env.test` exist. These files are required for the dev server, tests, and tooling like `knip` to run correctly.

**Always run these commands first:**

```bash
cp .env.example .env.development
cp .env.example .env.test
```

Then set `NODE_ENV` appropriately in each file:

- In `.env.development`: `NODE_ENV=development`
- In `.env.test`: `NODE_ENV=test`

This provides working defaults for all services (Postgres, ClickHouse, Redis, etc.) that match the Docker Compose setup, allowing tests, dev commands, and `knip` to run without additional configuration.

## Testing Conventions

- Shared default environment: Node with globals enabled (`packages/vitest-config/index.ts`)
- Write tests, mostly e2e, some unit tests when logic is complex
- **Unit tests**: domain entities/use-cases/policies with fakes
- **Contract tests**: adapter compliance against domain ports
- **Integration tests**: infra-backed tests for Postgres/ClickHouse/Redis/BullMQ/object storage
- **End-to-end tests**: ingest boundary to query boundary across organization scoping
- Keep tests deterministic and isolated
- Prefer package-local runs during iteration; run full monorepo tests before PR

### Database Testing (In-Memory)

**Always use in-memory databases for tests.** Do not use `vi.mock`/`vi.fn` to mock repository methods and do not require running database servers. The project provides embedded, in-process database engines that run the real SQL against the real schema:

- **ClickHouse → chdb** (`chdb` package): An in-process ClickHouse engine via `@platform/testkit`.
- **Postgres → PGlite** (`@electric-sql/pglite`): An in-process Postgres via WASM via `@platform/testkit`.

#### Postgres test setup (`@platform/testkit`)

```typescript
import { setupTestPostgres } from "@platform/testkit";
import { beforeAll, describe, it } from "vitest";

const pg = setupTestPostgres();

describe("MyRepository", () => {
  it("does something", async () => {
    // pg.postgresDb is a real Drizzle instance backed by PGlite in-memory
    // pg.db is the lower-level Drizzle/PGlite instance for direct queries
  });
});
```

`setupTestPostgres()` registers vitest hooks automatically:

- **beforeAll**: creates a PGlite instance, creates the `latitude_app` role, and runs all Drizzle migrations
- **afterAll**: closes the PGlite connection

#### ClickHouse test setup (`@platform/testkit`)

```typescript
import { setupTestClickHouse } from "@platform/testkit";
import { beforeAll, describe, it } from "vitest";

const ch = setupTestClickHouse();

describe("MyRepository", () => {
  let repo: ReturnType<typeof createMyRepository>;

  beforeAll(() => {
    repo = createMyRepository(ch.client);
  });

  it("does something", async () => {
    // ch.client is a real ClickHouseClient backed by chdb in-memory
  });
});
```

`setupTestClickHouse()` registers vitest hooks automatically:

- **beforeAll**: creates a chdb session and loads the schema from `schema.sql`
- **beforeEach**: truncates all tables for test isolation
- **afterAll**: destroys the session and cleans up temp files

The schema file is generated from the development ClickHouse instance. After applying new ClickHouse migrations, regenerate it:

```bash
pnpm --filter @platform/db-clickhouse ch:schema:dump
```

#### Why not `vi.mock`?

Mocking repositories with `vi.fn()` tests the wiring, not the queries. In-memory databases catch real bugs: wrong column names, broken `argMax` aggregations, incorrect `GROUP BY` clauses, and schema mismatches. They run in <1s with zero external dependencies.

## Adding New Infrastructure Dependencies

1. Add concrete provider package in `packages/platform/*-<provider>`
2. Wire via app composition root and environment-driven config
3. Keep domain unchanged unless business behavior changes

## Frontend Guidelines (Web App)

When working on `apps/web` or any frontend code:

### Legacy UI Reference

- Before building new UI, inspect the old v1 UI/components and product patterns as a reference when relevant.
- Reuse as much as possible when the old implementation is still solid.
- Do not copy v1 UI blindly; review it critically and improve it to match v2 conventions, architecture, and quality expectations when needed.

### Components

- **Always** use `Text` component from `@repo/ui` for all text content
- **Always** use `Button` component from `@repo/ui` for all buttons
- **Always** use `GoogleIcon` and `GitHubIcon` from `@repo/ui` for OAuth provider icons

### Route-Level Component Organization

Place React components close to the routes that use them, inside a `-components/` subfolder within the route directory. This keeps route files (which TanStack Router auto-discovers) clearly separated from supporting components.

```
routes/_authenticated/projects/$projectId/datasets/
├── index.tsx                       # route file
├── $datasetId.tsx                  # route file
└── -components/                    # supporting components for these routes
    ├── dataset-table.tsx
    ├── row-detail-panel.tsx
    └── version-badge.tsx
```

- Route files live directly in the route directory — TanStack Router discovers them
- Components that support those routes live in an adjacent `-components/` folder
- `domains/` directories (`apps/web/src/domains/`) are for state management only: server functions (writes) and collections/queries (reads) — **not** UI components

### Design System Showcase

- When adding a new implemented UI component in `packages/ui` (or replacing a placeholder export with a real implementation), update `apps/web/src/routes/design-system.tsx` to include a usage example for that component in both light and dark mode previews.
- Treat `apps/web/src/routes/design-system.tsx` as the canonical visual inventory for `@repo/ui` components.

### State Management (TanStack)

The web app uses a **server-centric, query-driven** architecture built on the TanStack ecosystem. No Zustand, Redux, or global stores.

**Server Functions** — All data fetching and mutations use `createServerFn` from `@tanstack/react-start`:

```typescript
import { Effect } from "effect"
import { ProjectRepository, createProjectUseCase } from "@domain/projects"
import { ProjectRepositoryLive, SqlClientLive } from "@platform/db-postgres"
import { getPostgresClient } from "../../server/clients.ts"

// Query (GET)
export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireSession()
  const client = getPostgresClient()

  return await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      return yield* repo.findAll()
    }).pipe(
      Effect.provide(ProjectRepositoryLive),
      Effect.provide(SqlClientLive(client, organizationId))
    )
  )
})

// Mutation (POST) with Zod validation
export const createProject = createServerFn({ method: "POST" })
  .inputValidator(createProjectSchema)
  .handler(async ({ data }) => {
    const { userId, organizationId } = await requireSession()
    const client = getPostgresClient()

    return await Effect.runPromise(
      createProjectUseCase({...}).pipe(
        Effect.provide(ProjectRepositoryLive),
        Effect.provide(SqlClientLive(client, organizationId))
      )
    )
  })
```

Server functions live in `apps/web/src/domains/*/functions.ts`.

**Collections** — Client-side reactive state uses TanStack React DB + Query via `queryCollectionOptions`:

```typescript
const projectsCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["projects"],
    queryFn: () => listProjects(),
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => { /* optimistic insert */ },
    onUpdate: async ({ transaction }) => { /* optimistic update */ },
    onDelete: async ({ transaction }) => { /* optimistic delete */ },
  }),
)

export const useProjectsCollection = (...) => useLiveQuery(...)
```

Collection files live in `apps/web/src/domains/*/collection.ts`.

**Route Guards** — Use `beforeLoad` for auth checks and redirects:

```typescript
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { user: session.user };
  },
});
```

**Key rules:**

- Server functions are the only data-fetching mechanism — no direct REST API calls from the client
- Use collections for reactive, queryable client state with automatic server sync
- Use `useState` for local UI state (modals, form visibility); no global stores
- Invalidate query cache after mutations: `getQueryClient().invalidateQueries({ queryKey: [...] })`
- Forms use TanStack React Form (`useForm` + `form.Field`)

### Layout & Spacing

- **Always** use flexbox for layout (`flex`, `flex-col`, `flex-row`)
- **Never** use margin utilities (no `m-*`, `mx-*`, `my-*`, `mt-*`, etc.)
- **Always** use `gap` utilities for spacing between elements (`gap-*`, `gap-x-*`, `gap-y-*`)
- **Always** use `p-*` (padding) for internal spacing within containers

### Example

```tsx
// ❌ Bad - using margins and space-y
<div className="space-y-4 mt-4">
 <div className="mb-2">Item 1</div>
 <div className="mb-2">Item 2</div>
</div>

// ✅ Good - using flexbox with gap
<div className="flex flex-col gap-4 pt-4">
 <div>Item 1</div>
 <div>Item 2</div>
</div>
```

## Cursor Cloud specific instructions

### Infrastructure

Docker is used for local infrastructure services. Start them before running apps:

```bash
sudo dockerd &>/dev/null &  # if Docker daemon not already running
sudo docker compose up -d postgres clickhouse redis redis-bullmq mailpit
```

### Database setup

After infrastructure is up, run migrations (idempotent):

```bash
pnpm --filter @platform/db-postgres pg:migrate
pnpm --filter @platform/db-clickhouse ch:up
pnpm --filter @platform/db-postgres pg:seed       # optional: creates seed users owner@acme.com / admin@acme.com
pnpm --filter @platform/db-clickhouse ch:seed     # optional: inserts sample span data
```

### Running dev servers

Start app services individually, matching the local `pnpm tmux` (tmuxinator) workflow:

```bash
pnpm --filter @app/web dev &
pnpm --filter @app/api dev &
pnpm --filter @app/ingest dev &
pnpm --filter @app/workers dev &
```

| Service    | Port | Health check                                          |
| ---------- | ---- | ----------------------------------------------------- |
| Web        | 3000 | `curl http://localhost:3000` (307 redirect to /login) |
| API        | 3001 | `curl http://localhost:3001/health`                   |
| Ingest     | 3002 | `curl http://localhost:3002/health`                   |
| Workers    | N/A  | Logs "workers ready and outbox consumer started"      |
| Mailpit UI | 8025 | `curl http://localhost:8025`                          |

### Auth for manual testing

The app uses magic-link authentication. Emails are captured by Mailpit at `http://localhost:8025`. Sign up through the web UI at `http://localhost:3000/signup`, then retrieve the magic link from Mailpit to complete authentication.

### Lint, typecheck, test commands

Standard commands per `AGENTS.md` Commands section: `pnpm check`, `pnpm typecheck`, `pnpm test`. All run cleanly.
