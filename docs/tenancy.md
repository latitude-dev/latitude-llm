# Tenancy Enforcement

This document explains how multi-tenancy is enforced in the Latitude LLM platform.

## Overview

We use a **simplified, single-layer approach** to tenancy enforcement:

- **Database Layer**: RLS policies on org-scoped tables only
- **Application Layer**: Explicit authorization checks for non-RLS tables
- **Single Command API**: `runCommand(db, organizationId?)` for all database operations

## Architecture

### RLS-Enabled Tables (Org-Scoped)

These tables have `organization_id` columns and enforce tenant isolation via Row Level Security:

| Table | RLS Policy |
|-------|-----------|
| `projects` | `organization_id = get_current_organization_id()` |
| `api_keys` | `organization_id = get_current_organization_id()` |
| `invitation` | `organization_id = get_current_organization_id()` |
| `grants` | `organization_id = get_current_organization_id()` |
| `subscription` | `organization_id = get_current_organization_id()` |

All these tables have `FORCE ROW LEVEL SECURITY` enabled, preventing owner bypass.

### Non-RLS Tables (App-Level Auth)

These tables rely on application-level authorization:

| Table | Enforcement |
|-------|-------------|
| `organization` | App-level membership checks |
| `member` | App-level membership checks |
| `user` | App-level auth checks |

## Command API

### `runCommand(db, organizationId?)`

The unified database command API:

```typescript
import { runCommand } from "@platform/db-postgres"

// With org context (sets RLS variable)
await runCommand(db, organizationId)(async (txDb) => {
  const repo = createProjectPostgresRepository(txDb)
  return repo.findByOrganizationId(organizationId)
})

// Without org context (for org/member/user operations)
await runCommand(db)(async (txDb) => {
  const repo = createOrganizationPostgresRepository(txDb)
  return repo.findAll()
})
```

**When to use org context:**
- Operations on RLS-enabled tables (`projects`, `api_keys`, etc.)
- Cross-tenant queries that need isolation

**When to omit org context:**
- Operations on `organization`, `member`, `user` tables
- Bootstrap flows (creating first org + membership)
- Admin/listing operations across organizations

## Migration

The tenancy setup is defined in:

```
drizzle/20260304135240_simplified-rls-setup/
├── migration.sql
└── snapshot.json
```

**Migration contents:**

```sql
-- Disable RLS on non-org tables
ALTER TABLE "latitude"."organization" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."member" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."user" DISABLE ROW LEVEL SECURITY;

-- Enable and force RLS on org-scoped tables
ALTER TABLE "latitude"."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "latitude"."projects" FORCE ROW LEVEL SECURITY;
-- ... (api_keys, invitation, grants, subscription)
```

## Usage Examples

### Creating a Project (RLS-Enabled Table)

```typescript
// apps/api/src/routes/projects.ts
app.post("/", async (c) => {
  const organizationId = c.var.organization.id
  
  const project = await runCommand(
    c.get("db"),
    organizationId  // Sets RLS context
  )(async (txDb) => {
    const repo = createProjectPostgresRepository(txDb)
    return Effect.runPromise(createProjectUseCase(repo)(input))
  })
  
  return c.json(project, 201)
})
```

### Creating an Organization (Non-RLS Table)

```typescript
// apps/api/src/routes/organizations.ts
app.post("/", async (c) => {
  const auth = c.get("auth")
  
  const organization = await runCommand(
    c.get("db")
    // No org ID - runs without RLS context
  )(async (txDb) => {
    const repo = createOrganizationPostgresRepository(txDb)
    return Effect.runPromise(createOrganizationUseCase(repo)(input))
  })
  
  return c.json(organization, 201)
})
```

### Listing User's Organizations (Non-RLS)

```typescript
// apps/web/src/domains/organizations/organizations.functions.ts
export const listOrganizations = createServerFn({ method: "GET" })
  .handler(async (): Promise<OrganizationRecord[]> => {
    const { userId } = await requireSession()
    const { db } = getPostgresClient()
    
    const memberships = (await runCommand(db)(async (txDb) => {
      const repo = createMembershipPostgresRepository(txDb)
      return Effect.runPromise(repo.findByUserId(userId))
    })) as readonly Membership[]
    
    // ... fetch organizations from memberships
  })
```

## Security Considerations

1. **RLS-backed tables**: Enforced at database level - impossible to bypass via code bugs
2. **Non-RLS tables**: Must have explicit app-level checks (middleware, use-cases)
3. **No backoffice bypass**: We removed `runAdminCommand` - no privileged escape hatch exists
4. **Force RLS**: All RLS tables have `FORCE ROW LEVEL SECURITY` preventing owner bypass

## Future Backoffice Needs

If true cross-tenant backoffice operations are needed in the future:

1. Create a `LAT_BACKOFFICE_DATABASE_URL` env var with BYPASSRLS role
2. Add `createBackofficePostgresClient()` in `packages/platform/db-postgres`
3. Add `runAdminCommand({ actorId, reason })(execute)` with audit logging
4. Restrict backoffice commands to internal tools/jobs only

## Testing Tenancy

All RLS-backed routes have integration tests verifying cross-tenant isolation:

```typescript
// apps/api/src/routes/projects.test.ts
it("GET isolates organization projects", async () => {
  const tenantA = await createTenantSetup(database.db)
  const tenantB = await createTenantSetup(database.db)
  
  const response = await app.fetch(
    new Request(`/v1/organizations/${tenantA.organizationId}/projects`, {
      headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
    }),
  )
  
  const body = await response.json()
  const ids = body.projects.map((p) => p.id)
  
  expect(ids).toContain(tenantAProject.id)
  expect(ids).not.toContain(tenantBProject.id)  // RLS blocks this
})
```
