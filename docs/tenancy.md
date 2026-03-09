# Tenancy Model

Two-layer defense: application-level org context + database-level RLS policies.

## Database Users

Two Postgres users are used with different privilege levels:

| User | Role | Connection | RLS |
|------|------|------------|-----|
| `latitude` | Superuser | `LAT_ADMIN_DATABASE_URL` | Bypassed |
| `latitude_app` | Regular | `LAT_DATABASE_URL` | Enforced |

`latitude_app` is created by `docker/init-db.sh` on container initialisation. The migration
`20260309145353_setup-runtime-db-user` grants it `USAGE` on the `latitude` schema and
`SELECT, INSERT, UPDATE, DELETE` on all tables, with default privileges set for future tables.

**Why this matters:** PostgreSQL bypasses RLS for superusers by default. With `latitude_app`
as the default runtime connection, every query goes through the RLS check — a bug that forgets
to set the org scope returns no rows rather than leaking cross-tenant data.

### When to use each connection

| Use case | Connection | Why |
|----------|------------|-----|
| Drizzle-kit migrations | `LAT_ADMIN_DATABASE_URL` | DDL requires superuser |
| Seeds / backfills | `LAT_ADMIN_DATABASE_URL` | Cross-org inserts, no RLS context |
| All normal app queries | `LAT_DATABASE_URL` | RLS enforced via `runCommand` |
| API key auth lookup (token hash → org) | `LAT_ADMIN_DATABASE_URL` via `getAdminPostgresClient()` | Must find key before org is known |
| Touch-buffer batch updates | `LAT_ADMIN_DATABASE_URL` via `getAdminPostgresClient()` | Updates keys across all orgs |

In `apps/api`, `getAdminPostgresClient()` exposes the superuser connection as a singleton for
the narrow set of runtime operations that legitimately need cross-org access.

## Repository Pattern

All repository factories take only a `db` connection — no `organizationId` parameter.
Org scoping comes from the RLS context, not from query predicates.

```typescript
// Every repo factory has the same shape:
const repo = createProjectPostgresRepository(db)
const repo = createApiKeyPostgresRepository(db)
const repo = createGrantPostgresRepository(db)
// etc.
```

### Scoped operations — runtime db + RLS context

`runCommand(db, organizationId)` wraps the operation in a transaction and sets
`app.current_organization_id` for that transaction. The RLS policy then filters every
table to only the rows belonging to that org.

```typescript
// latitude_app sees only this org's rows
await runCommand(db, organizationId)(async (txDb) => {
  const repo = createProjectPostgresRepository(txDb)
  return Effect.runPromise(
    Effect.gen(function* () {
      const r = yield* ProjectRepository
      return yield* r.findAll()
    }).pipe(Effect.provideService(ProjectRepository, repo)),
  )
})
```

### Cross-org operations — admin db, no RLS context

Operations that must span organizations (auth lookups, batch jobs) use the admin connection.
The repository is the same factory; what differs is the underlying `db`.

```typescript
import { getAdminPostgresClient } from "../clients.ts"

const { db: adminDb } = getAdminPostgresClient()
const repo = createApiKeyPostgresRepository(adminDb)

// Finds the key regardless of which org it belongs to
const apiKey = await Effect.runPromise(repo.findByTokenHash(tokenHash))
```

`findByTokenHash` and `touchBatch` are annotated in the repository to signal they are
only safe when the underlying connection bypasses RLS.

## Database RLS Policies

RLS policies use `get_current_organization_id()` — a `SECURITY DEFINER` function that reads
the `app.current_organization_id` session variable set by `runCommand`.

| Table | RLS Enabled | Notes |
|-------|-------------|-------|
| `projects` | ✅ | Org-scoped |
| `grants` | ✅ | Org-scoped |
| `subscription` | ✅ | Scoped via `reference_id` |
| `invitation` | ✅ | Org-scoped |
| `api_keys` | ✅ | Org-scoped |
| `member` | ✅ | Org-scoped |
| `organization` | ❌ | App-level auth only |
| `user` | ❌ | App-level auth only |
| `session` | ❌ | App-level auth only |

## Security Model

**Defense in depth:**

1. **Database layer**: `latitude_app` is subject to RLS — policies enforce isolation even if
   application code has bugs. No org context → no rows visible.
2. **Application layer**: `runCommand(db, organizationId)` sets the RLS context explicitly for
   every scoped transaction, making the org boundary visible in code.
3. **Explicit admin escalation**: cross-org access requires deliberately calling
   `getAdminPostgresClient()`, making bypass easy to audit.
