# AGENTS.md

Operational guide for coding agents working in this repository.

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

### Ports and Adapters

- Domain depends on interfaces/tags only (ports)
- Platform packages (`packages/platform/*`) implement adapters
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

## Stack Conventions

- Effect TS primitives for core code
- Drizzle ORM for Postgres adapters
- Hono for API and ingest boundaries
- TanStack Start + React for web
- Biome for lint/format

## Required Toolchain

- Node.js: `>=26` (see root `package.json`)
- Package manager: `pnpm@9`
- Task runner: `turbo` via root scripts
- Lint/format: Biome (`@biomejs/biome` 1.9.x)
- Tests: Vitest 3.x
- Install deps: `pnpm install`

## Commands

### Top-Level (run from repo root)

- `pnpm dev` - run all workspace `dev` tasks via Turbo
- `pnpm build` - run all workspace builds
- `pnpm lint` - run all workspace lint scripts (also auto-fixes with `--write`)
- `pnpm typecheck` - run all workspace typechecks
- `pnpm test` - run all workspace tests

### Package-Scoped (use `--filter`)

```bash
pnpm --filter @app/api lint
pnpm --filter @app/api typecheck
pnpm --filter @app/api build
pnpm --filter @app/api test
```

Path-based filtering also works:

```bash
pnpm --filter ./apps/api test
pnpm --filter ./packages/domain/workspaces lint
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
pnpm lint
pnpm typecheck
pnpm test
```

CI workflows (`node-lint.yml`, `typecheck.yml`, `test.yml`) use Node 26 + pnpm 9 and run the same commands.

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

### TypeScript

Base config: `tsconfig.base.json`

- `strict: true` is enabled; keep code strict-clean
- Module system: `NodeNext` + ESM (`"type": "module"` in packages/apps)
- Prefer explicit domain types/interfaces over loose objects
- Use `readonly` fields for immutable domain data shapes
- Avoid `any`; use `unknown` + narrowing
- Validate boundary inputs early (API input, queue payloads, external IO)

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
- Domain models are independent from table/row shapes
- Mapping from DB rows to domain objects belongs in platform adapters
- **Apps use pool-based connections**: Use `createPostgresPool()` in `apps/*/clients.ts` for direct pool access

### Database Migrations (Drizzle Kit)

**Always use drizzle-kit for migrations.** Never create manual SQL files in the drizzle folder.

**Schema changes:**

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate
```

**Custom SQL (RLS policies, seed data):**

```bash
# Create custom migration for DDL not supported by Drizzle
npx drizzle-kit generate --custom --name=enable-rls

# Edit the SQL file, then run:
npx drizzle-kit migrate
```

**Key points:**

- Use `drizzle-kit generate` for schema changes (creates timestamped migration)
- Use `drizzle-kit generate --custom` for custom SQL
- Never manually create SQL files in the drizzle folder
- Use `IF NOT EXISTS` in custom SQL for idempotency
- Migrations are tracked in `drizzle.__drizzle_migrations` table

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

**Always** use `parseEnv` or `parseEnvOptional` from `@platform/env`:

```typescript
// ❌ Bad - direct process.env access
const isDev = process.env.NODE_ENV === "development";

// ✅ Good - using parseEnv
import { parseEnv, parseEnvOptional } from "@platform/env";
import { Effect } from "effect";

const nodeEnv =
  Effect.runSync(parseEnvOptional(process.env.NODE_ENV, "string")) ??
  "development";
const port = Effect.runSync(parseEnv(process.env.PORT, "number", 3000));
```

This ensures type-safe parsing, clear error messages for missing vars, and consistent validation.

## Async and Background Task Guidance

- Pass IDs in async jobs/queue payloads, not full mutable models
- Re-fetch current state inside task handlers
- Make stale/deleted entity behavior explicit

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
