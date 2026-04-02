---
name: database-postgres
description: Drizzle schema, repositories, RLS, SqlClient wiring, Postgres migrations, psql / reset, or platform mappers (toDomain* / toInsertRow).
---

# Postgres, SqlClient, schema, migrations, mappers

**When to use:** Drizzle schema, repositories, RLS, SqlClient wiring, Postgres migrations, `psql` / reset, or platform mappers (`toDomain*` / `toInsertRow`).

## Database patterns (Postgres)

- Postgres adapter stack uses Drizzle ORM in `packages/platform/db-postgres`
- Domain models are independent from table/row shapes
- Mapping from DB rows to domain objects belongs in platform adapters
- **Apps use SqlClient for all DB access**: Boundaries provide `SqlClientLive` with organization context for RLS enforcement

## SqlClient and row-level security (RLS)

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
import { SqlClientLive } from "@platform/db-postgres"
import { ProjectRepositoryLive } from "@platform/db-postgres"

app.openapi(createProjectRoute, async (c) => {
  const project = await Effect.runPromise(
    createProjectUseCase(input).pipe(
      Effect.provide(ProjectRepositoryLive),
      Effect.provide(SqlClientLive(c.var.postgresClient, c.var.organization.id)),
    ),
  )
  return c.json(toProjectResponse(project), 201)
})
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

    yield* sqlClient.transaction(handleIntentByType(intent, input.session))
  })

const handleSignup = (intent, session) =>
  Effect.gen(function* () {
    const users = yield* UserRepository
    const memberships = yield* MembershipRepository

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

## Postgres management

Connect to the development database:

```bash
docker compose exec postgres psql -U latitude -d latitude_development
```

Reset only the Postgres volume (without affecting other services):

```bash
pnpm --filter @platform/db-postgres pg:reset
```

This runs `docker/reset-postgres.sh` which stops postgres, removes the `data-llm_postgres_data` volume, restarts postgres, waits for it to be ready, runs migrations, and seeds the database.

## Postgres schema conventions

All Drizzle table definitions in `packages/platform/db-postgres/src/schema/` **must** follow these rules. Shared helpers live in `schemaHelpers.ts`.

Organization-scoped Postgres tables must use the repository RLS conventions.

1. **Use `latitudeSchema`** — never create a local `pgSchema("latitude")`. Import `latitudeSchema` from `../schemaHelpers.ts`.
2. **Use `cuid("id").primaryKey()`** — every table's primary key must use the `cuid()` helper (`varchar(24)` with auto-generated CUID2).
3. **Use `tzTimestamp(name)`** — never use raw `timestamp(name, { withTimezone: true })`. Import `tzTimestamp` from the helpers.
4. **Use `...timestamps()`** — every table that has `createdAt`/`updatedAt` must spread the `timestamps()` helper (includes `$onUpdateFn` on `updatedAt`).
5. **Use `organizationRLSPolicy(tableName)`** — every table with an `organization_id` column must include this helper in its third argument to enable row-level security.
6. **No foreign keys** — new Postgres tables must not add foreign key constraints. Do not use `.references()` or manually create `FOREIGN KEY` constraints. Referential integrity is enforced at the application/domain layer. Use indexes on relationship columns instead (e.g. `index().on(t.datasetId)` rather than `.references(() => datasets.id)`).

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

## Database migrations (Drizzle Kit)

### Migration execution safety (agents)

Do **not** run Postgres migration commands (`pg:generate`, `pg:generate:custom`, `pg:migrate`, etc.) unless the user explicitly asked in this conversation. If migrations are needed but not requested, explain and wait for confirmation. ClickHouse / Weaviate follow the same policy in their respective skills.

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
- For additive changes to existing tables, prefer ordinary generated `ALTER TABLE` migrations over bespoke backfill choreography unless the change truly requires data rewriting.
- Never manually create SQL files in the drizzle folder
- Use `IF NOT EXISTS` in custom SQL for idempotency
- Migrations are tracked in `drizzle.__drizzle_migrations` table

## Repository port naming

Domain repository ports and method naming conventions (including Effect result shapes and when to use `listBy*` vs `findBy*`) live in [docs/repositories.md](../../../docs/repositories.md). Prefer that vocabulary for new Postgres-backed ports and when renaming existing methods.

## Mapper conventions

When writing `toDomain*` and `toInsertRow` functions in platform repositories:

- **Never hardcode field values.** Every field on the domain entity must be read from the DB row (`row.fieldName`), not assigned a literal (`null`, `""`, `new Date()`). If a field has no backing column, that is a schema gap — add the column or remove the field from the domain type.
- **Never use `as EntityType` casts** on mapper return values. These bypass TypeScript's structural check and hide type mismatches. Let the return type be inferred or explicitly annotated — the compiler will catch missing or incompatible fields.
- **Never coerce nullable columns** with `?? fallback` to satisfy a non-nullable domain type. Surface the mismatch: either make the column `notNull()` or make the domain field nullable.
- **`toInsertRow` must round-trip.** Every field written by `toInsertRow` should be readable by `toDomain*`, and vice versa. A field present in the domain type but absent from `toInsertRow` means data is silently discarded on write.
