# Tenancy Model

Two-layer defense: application-level repository scoping + database-level RLS policies.

## Repository Types

| Type | Interface | Org ID | Use Case |
|------|-----------|--------|----------|
| **Scoped** | `ScopedRepository` | Constructor param | Regular CRUD within one org |
| **Unscoped** | `UnscopedRepository` | None | Cross-org operations (auth, batch jobs) |

### Scoped Repository

```typescript
// Organization ID baked in at initialization
const repo = createProjectPostgresRepository(db, organizationId)

// All operations automatically scoped
await repo.findById(id)           // Only finds if id belongs to org
await repo.save(project)          // Validates project.orgId matches
await repo.findAll()              // Only returns org's projects
```

### Unscoped Repository

```typescript
// No organization context required
const repo = createUnscopedApiKeyPostgresRepository(db)

// Cross-organization operations
await repo.findByTokenHash(hash)  // Looks up across all orgs
await repo.touchBatch(ids)        // Updates keys from any org
```

## Database RLS Policies

| Table | RLS | Forced | Notes |
|-------|-----|--------|-------|
| `projects` | ✅ | ✅ | Org-scoped, no bypass |
| `grants` | ✅ | ✅ | Org-scoped, no bypass |
| `subscription` | ✅ | ✅ | Org-scoped, no bypass |
| `invitation` | ✅ | ✅ | Org-scoped, no bypass |
| `api_keys` | ✅ | ❌ | **Not forced** - allows owner bypass for unscoped queries |
| `organization` | ❌ | ❌ | App-level auth |
| `member` | ❌ | ❌ | App-level auth |
| `user` | ❌ | ❌ | App-level auth |

**Why `api_keys` is special:**
- Authentication needs to find API key by token hash **before** knowing which org it belongs to
- Touch buffer needs to batch-update keys across all orgs efficiently
- RLS enabled but **not forced** = regular queries go through RLS, owner bypasses for unscoped operations

## Code Examples

### Authentication (Unscoped)

```typescript
// apps/api/src/middleware/auth.ts
const unscopedRepo = createUnscopedApiKeyPostgresRepository(db)
const apiKey = await unscopedRepo.findByTokenHash(tokenHash)
// ^ Cross-org lookup works because:
// 1. Uses unscoped repository (no org filter in query)
// 2. api_keys table is not FORCE RLS (owner bypasses policy)
```

### Touch Buffer (Unscoped)

```typescript
// apps/api/src/middleware/touch-buffer.ts
const unscopedRepo = createUnscopedApiKeyPostgresRepository(db)
await unscopedRepo.touchBatch(keyIds)  // Updates across all orgs
```

### Regular Operations (Scoped)

```typescript
// apps/api/src/routes/projects.ts
const repo = createProjectPostgresRepository(db, organizationId)
await createProjectUseCase(repo)(input)
// ^ Scoped repository + FORCE RLS = double protection
```

## Transaction Context

```typescript
// Scoped operations set RLS context
await runCommand(db, organizationId)(async (txDb) => {
  const repo = createProjectPostgresRepository(txDb, organizationId)
  return repo.findAll()
})

// Unscoped operations don't set RLS context
await runCommand(db)(async (txDb) => {
  const repo = createUnscopedApiKeyPostgresRepository(txDb)
  return repo.findByTokenHash(hash)
})
```

## Security Model

**Defense in depth:**

1. **Application layer**: Repository scoping ensures code can't accidentally query wrong org
2. **Database layer**: RLS policies enforce isolation even if app code has bugs
3. **FORCE RLS**: Prevents even table owner from bypassing policies (except api_keys)

**api_keys exception:**
- RLS policy exists and applies to regular queries
- Not forced = owner (unscoped repo) can bypass for legitimate cross-org operations
- Authorization still enforced at app layer (middleware validates token → org match)
