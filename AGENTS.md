# AGENTS.md

Operational guide for coding agents working in this repository.

## Product Scope

Multi-tenant LLM observability platform. Monorepo managed with `pnpm` workspaces + `turbo`.

## Architecture Rules

### App Boundaries (`apps/*`)

Apps only handle:

- Input validation
- Authentication and authorization
- Workspace access enforcement
- Routing to domain use-cases

No business logic in handlers, controllers, or jobs.

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

### Ports and Adapters

- Domain depends on interfaces/tags only (ports like `Repository`, `CacheStore`, `Publisher`)
- Platform packages implement adapters
- Composition roots in apps provide live layers
- Domain must never import concrete DB/cache/queue/object storage clients

### Data and Infrastructure

- **Postgres**: Control-plane and relational data (users, workspaces, memberships, config)
- **ClickHouse**: High-volume telemetry storage and analytical reads
- **Redis**: Cache and BullMQ backend
- **Object storage**: Durable raw ingest payload buffering

### Multi-tenancy

- Every request is workspace-scoped
- A user may belong to many workspaces
- Workspace membership checks happen at boundaries before domain execution
- All telemetry persistence and query paths include `workspaceId`

### Anti-patterns to Reject

- Business logic inside handlers/controllers/jobs
- Domain importing DB clients, Redis, BullMQ, or object storage SDKs
- Cross-domain logic without clear ownership
- New provider integrations without a core capability contract
- Introducing application env vars without the `LAT_` prefix (see Environment Variables)

## Stack Conventions

- Effect TS primitives for core code
- Drizzle ORM for Postgres adapters
- Hono for API and ingest boundaries
- TanStack Start + React for web
- Biome for lint/format

## Required Toolchain

- Node.js: `>=25` (see root `package.json`)
- Package manager: check `package.json` and `packageManager` field (e.g. `pnpm` 10.30.0)
- Check if mise is installed and use mise to switch to found node version in
`package.json`. If Mise is not found ignore this.
- Task runner: `turbo` via root scripts
- Lint/format: Biome (`@biomejs/biome` 1.9.x)
- Tests: Vitest 3.x
- Install deps: `pnpm install`

### Agent Install Safety Rule

- Agents must **never** run `pnpm install` (including `--no-frozen-lockfile`) in this repository.
- If dependency installation is needed, ask the user to run `pnpm install` locally and continue only after confirmation.

## Commands

### Top-Level (run from repo root)

- `pnpm dev` - run all workspace `dev` tasks via Turbo
- `pnpm build` - run all workspace builds
- `pnpm check` - run all workspace lint and format check scripts
- `pnpm typecheck` - run all workspace typechecks
- `pnpm test` - run all workspace tests

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
- Max line width: 100
- Strings: double quotes
- Semicolons: always
- Ignore generated/output dirs: `dist`, `coverage`, `.turbo`, `node_modules`
- Prefer package-local formatting: `pnpm --filter @app/api format`

### Imports

- Prefer static imports; avoid dynamic import patterns unless justified
- Use `import type { ... }` for type-only imports
- Keep imports explicit and grep-friendly
- Preserve clear grouping/order (external, internal alias, then relative)
- Avoid wildcard exports/imports when explicit named exports are practical
- Avoid barrel files (index.ts re-exporting from the same directory); import from the specific module

### TypeScript

Base config: `tsconfig.base.json`

- `strict: true` is enabled; keep code strict-clean
- Module system: `NodeNext` + ESM (`"type": "module"` in packages/apps)
- Prefer explicit domain types/interfaces over loose objects
- Use `readonly` fields for immutable domain data shapes
- Avoid `any`; use `unknown` + narrowing
- Validate boundary inputs early (API input, queue payloads, external IO)

### General Principles

- Prefer minimal, explicit abstractions — YAGNI
- Avoid comments except for genuinely non-obvious reasoning

### Naming Conventions

- Types/interfaces/classes: `PascalCase`
- Variables/functions/methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE` only for true constants; otherwise `camelCase` + `as const`
- File names favor concise module roots (`src/index.ts`, `src/server.ts`, `src/main.tsx`)
- Package names follow scoped workspace style (`@app/*`, `@domain/*`, etc.)

### Domain Design (DDD)

- Organize by bounded context (e.g. telemetry, workspaces, identity, alerts)
- Domains should be single-responsibility and focused on policy/rules
- Use in-memory adapters for fast tests where possible

## Database Patterns

- Postgres adapter stack uses Drizzle ORM in `packages/platform/db-postgres`
- ClickHouse adapter stack remains SQL-oriented in `packages/platform/db-clickhouse`
- Weaviate adapter stack lives in `packages/platform/db-weaviate`
- Domain models are independent from table/row shapes
- Mapping from DB rows to domain objects belongs in platform adapters
- **Apps use pool-based connections**: Use `createPostgresPool()` in `apps/*/clients.ts` for direct pool access

### Postgres Schema Conventions

All Drizzle table definitions in `packages/platform/db-postgres/src/schema/` **must** follow these rules. Shared helpers live in `schemaHelpers.ts`.

1. **Use `latitudeSchema`** — never create a local `pgSchema("latitude")`. Import `latitudeSchema` from `../schemaHelpers.ts`.
2. **Use `cuid("id").primaryKey()`** — every table's primary key must use the `cuid()` helper (`varchar(128)` with auto-generated CUID2).
3. **Use `tzTimestamp(name)`** — never use raw `timestamp(name, { withTimezone: true })`. Import `tzTimestamp` from the helpers.
4. **Use `...timestamps()`** — every table that has `createdAt`/`updatedAt` must spread the `timestamps()` helper (includes `$onUpdateFn` on `updatedAt`).
5. **Use `organizationRLSPolicy(tableName)`** — every table with an `organization_id` column must include this helper in its third argument to enable row-level security.

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
)
```

### Database Migrations (Drizzle Kit)

**Always use drizzle-kit for migrations.** Never create manual SQL files in the drizzle folder.

**Schema changes:**

```bash
# Generate migration from schema changes (always provide --name)
pnpm --filter @platform/db-postgres pg:generate --name=describe-the-change

# Apply migrations
pnpm --filter @platform/db-postgres pg:migrate
```

**Custom SQL (RLS policies, seed data):**

```bash
# Create custom migration for DDL not supported by Drizzle
pnpm --filter @platform/db-postgres pg:generate:custom --name=enable-rls

# Edit the SQL file, then run:
pnpm --filter @platform/db-postgres pg:migrate
```

**Key points:**

- **Always pass `--name`** — use a short kebab-case description (e.g. `--name=add-projects-table`). Never let Drizzle auto-generate a random name.
- Use `pg:generate --name=...` for schema changes (creates timestamped migration)
- Use `pg:generate:custom --name=...` for custom SQL
- Never manually create SQL files in the drizzle folder
- Use `IF NOT EXISTS` in custom SQL for idempotency
- Migrations are tracked in `drizzle.__drizzle_migrations` table

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

## Effect Patterns

- Core code uses Effect TS primitives consistently
- Prefer `Effect.gen` for sequential effect composition
- Wrap promise-based APIs with `Effect.tryPromise` and typed errors
- Use `Data.TaggedError` for domain-specific error types
- Use `Effect.repeat` with `Schedule` for polling/recurring tasks
- Use `Fiber` for lifecycle management of long-running effects

## Error Handling

- Prefer typed errors (`Data.TaggedError`) over raw `Error` or `unknown`
- Use `Effect.either` for operations that may fail but shouldn't stop execution
- Handle errors at boundaries; propagate through Effect error channel internally

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

## Side Effects and Eventing

- Domain logic emits domain events through domain-level publisher abstractions
- Side effects (notifications, integrations, projections) are handled asynchronously by workers
- Do not put side-effect orchestration inside HTTP handlers

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
- Service connection details our code reads (`LAT_CLICKHOUSE_URL`, `LAT_REDIS_HOST`, ...)
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

- Pass IDs in async jobs/queue payloads, not full mutable models
- Re-fetch current state inside task handlers
- Make stale/deleted entity behavior explicit

## Cloud Agent Environment Setup

When running as a cloud agent (e.g. Cursor Cloud Agent), the repository may not have `.env.development` or `.env.test` files. These are required for running the dev server and tests respectively.

**If `.env.development` or `.env.test` do not exist**, copy `.env.example` as-is:

```bash
cp .env.example .env.development
cp .env.example .env.test
```

Then set `NODE_ENV` appropriately in each file:

- In `.env.development`: `NODE_ENV=development`
- In `.env.test`: `NODE_ENV=test`

This provides working defaults for all services (Postgres, ClickHouse, Redis, etc.) that match the Docker Compose setup, allowing tests and dev commands to run without additional configuration.

## Testing Conventions

- Test runner: Vitest
- Shared default environment: Node with globals enabled (`packages/vitest-config/index.ts`)
- Write tests, mostly e2e, some unit tests when logic is complex
- **Unit tests**: domain entities/use-cases/policies with fakes
- **Contract tests**: adapter compliance against domain ports
- **Integration tests**: infra-backed tests for Postgres/ClickHouse/Redis/BullMQ/object storage
- **End-to-end tests**: ingest boundary to query boundary across workspace scoping
- Keep tests deterministic and isolated
- Prefer package-local runs during iteration; run full monorepo tests before PR

## Adding New Infrastructure Dependencies

1. Add a capability interface in `packages/platform/*-core`
2. Add concrete provider package in `packages/platform/*-<provider>`
3. Wire via app composition root and environment-driven config
4. Keep domain unchanged unless business behavior changes

## Frontend Guidelines (Web App)

When working on `apps/web` or any frontend code:

### Components

- **Always** use `Text` component from `@repo/ui` for all text content
- **Always** use `Button` component from `@repo/ui` for all buttons
- **Always** use `GoogleIcon` and `GitHubIcon` from `@repo/ui` for OAuth provider icons

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
