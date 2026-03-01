---
title: Implement Baseline Domain Business Logic
type: feat
status: completed
date: 2026-03-01
---

# Implement Baseline Domain Business Logic

**Status: COMPLETED** ✅

## Summary

Successfully implemented the complete business logic layer for all baseline domains:

### What Was Built

1. **Shared Kernel** (`packages/domain/shared-kernel/`) - Foundation for all domains
   - Branded ID types (UserId, WorkspaceId, ProjectId, etc.)
   - Base error types using Effect's Data.TaggedError
   - Validation utilities for emails, timestamps, money

2. **Better Auth Integration** (`packages/platform/auth-better/`) - Authentication
   - Factory function to create Better Auth instance
   - Drizzle ORM adapter configuration
   - Hono middleware for session validation
   - Event hooks for syncing with domain events

3. **RLS Infrastructure** (`packages/platform/db-postgres/src/rls.ts`) - Multi-tenancy
   - Helpers for setting workspace context
   - SQL policies for row-level security
   - Transaction-scoped RLS context management

4. **Workspaces Domain** (`packages/domain/workspaces/`) - Multi-tenancy
   - Workspace entity (maps to Better Auth organization)
   - Membership entity with roles
   - Repository ports for persistence
   - Use cases for workspace operations
   - Domain events

5. **Projects Domain** (`packages/domain/projects/`) - Project management
   - Project entity with soft delete
   - Repository ports with RLS support
   - Use cases for CRUD operations

6. **API Keys Domain** (`packages/domain/api-keys/`) - API access
   - ApiKey entity with token generation
   - Repository ports with findByToken
   - Use cases for generation and revocation

7. **Subscriptions Domain** (`packages/domain/subscriptions/`) - Billing
   - Subscription entity with plan enum
   - Grant entity for quota management
   - Repository ports for subscriptions and grants
   - Use cases for subscription lifecycle

8. **Database Schema** (`packages/platform/db-postgres/src/schema/`)
   - Drizzle ORM definitions for all tables
   - RLS policy SQL files
   - Enum types for plans and quotas

### Files Created

- 6 new domain packages
- 5 new platform packages/components
- 40+ TypeScript files
- 6 Drizzle schema definitions
- Comprehensive RLS policies

## Overview

Implement the complete business logic layer for all baseline domains in the V2 rewrite: workspaces, users, auth (OAuth + magic links), API keys, projects, and subscriptions. This is Phase 1 of the V2 rewrite (see V2_PLAN.md). These domains form the foundational identity, access control, and billing layer for the multi-tenant LLM observability platform.

## Problem Statement

The repository has been scaffolded with infrastructure packages (db-postgres, cache-redis, queue-bullmq, events-outbox) and the events domain package. However, the core business domains that manage workspaces, users, authentication, projects, and billing do not yet exist. Without these domains, the platform cannot support multi-tenant operations, user management, or subscription-based access control.

## Proposed Solution

Create six new domain packages following DDD principles with the ports/adapters pattern already established in the codebase:

1. **packages/domain/identity** - Users and authentication (OAuth + magic links)
2. **packages/domain/workspaces** - Workspace management and membership
3. **packages/domain/projects** - Project management within workspaces
4. **packages/domain/api-keys** - API key generation and management
5. **packages/domain/subscriptions** - Subscription plans, billing, and quota management

Each domain will expose:
- Domain entity definitions (immutable data structures)
- Repository ports (interfaces for data access)
- Use cases (business logic orchestration)
- Domain events (for cross-domain communication)
- Effect-based error handling

## Technical Approach

### Why Branded ID Types?

Using specific branded types for entity IDs (e.g., `UserId`, `WorkspaceId`) provides compile-time type safety that prevents common bugs:

```typescript
// Without branded types - error-prone:
function getUser(id: string) { ... }
function getWorkspace(id: string) { ... }

getUser(workspaceId); // Compiles, but wrong! Runtime error waiting to happen.

// With branded types - bug caught at compile time:
type UserId = string & { readonly __brand: 'UserId' };
type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };

function getUser(id: UserId) { ... }
function getWorkspace(id: WorkspaceId) { ... }

getUser(workspaceId); // ❌ Type error! UserId ≠ WorkspaceId
```

Benefits:
- **Prevents ID mix-ups** - Can't accidentally pass a UserId where WorkspaceId expected
- **Self-documenting code** - Function signatures clearly show what ID type is required
- **Refactoring safety** - TypeScript catches all call sites when ID types change
- **Zero runtime cost** - Brand is erased at compile time, just strings at runtime

### Architecture

```
packages/domain/
├── shared-kernel/          # Already exists - extend with common types
├── events/                 # Already exists
├── identity/               # NEW: Users and workspace memberships (via Better Auth)
├── workspaces/             # NEW: Workspace management
├── projects/               # NEW: Projects
├── api-keys/               # NEW: API keys
└── subscriptions/          # NEW: Subscriptions, plans, grants, quotas
```

### Domain Responsibilities

| Domain | Core Entities | Key Use Cases | Events Published |
|--------|---------------|---------------|------------------|
| **Identity** | User, OAuthAccount, Session (via Better Auth) | Register, Login, Logout, Session Management | UserCreated, UserLoggedIn, SessionCreated |
| **Workspaces** | Workspace, Membership | Create Workspace, Invite Member, Accept Invite, Remove Member | WorkspaceCreated, MemberInvited, MemberJoined |
| **Projects** | Project | Create Project, Update Project, Delete Project | ProjectCreated, ProjectDeleted |
| **API Keys** | ApiKey | Generate Key, Revoke Key, Rotate Key | ApiKeyCreated, ApiKeyRevoked |
| **Subscriptions** | Subscription, Grant, Quota | Subscribe, Change Plan, Cancel, Issue Grants | SubscriptionCreated, SubscriptionChanged, GrantIssued |

## Authentication Strategy

### Better Auth (Recommended)

**Why Better Auth?**
- **Most comprehensive** TypeScript auth library as of 2026
- **Framework-agnostic** - Works with Hono, TanStack Start, Solid (our stack)
- **Native Postgres/Drizzle support** - Integrates with our existing db-postgres adapter
- **Multi-tenancy built-in** - Organization/workspace support out of the box
- **Acquired Auth.js** - Maintains the former NextAuth.js ecosystem
- **Features included**: OAuth (Google, GitHub, etc.), email/password, magic links, 2FA, sessions, RBAC
- **Self-hosted** - We own the auth infrastructure, no vendor lock-in
- **Active development** - Rapidly gaining adoption, strong community

**Comparison with alternatives:**
| Library | Status | Multi-tenancy | Drizzle Support | Framework Agnostic |
|---------|--------|---------------|-----------------|-------------------|
| **Better Auth** | ✅ Active | ✅ Built-in | ✅ Native | ✅ Yes |
| Auth.js | ✅ Mature | ❌ Limited | ⚠️ Adapter | ⚠️ React-focused |
| Lucia | ⚠️ Deprecated | ❌ Manual | ✅ Adapter | ✅ Yes |
| Supabase Auth | ✅ Active | ✅ Yes | ⚠️ Via Supabase | ❌ Supabase only |

### Better Auth Integration Plan

```typescript
// packages/platform/auth-better/src/index.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const createAuth = (db: DrizzleDatabase) => {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg", // PostgreSQL
    }),
    // OAuth providers
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    },
    // Email/password (optional, can disable if using OAuth only)
    emailAndPassword: {
      enabled: false, // Start with OAuth only, add password later if needed
    },
    // Magic links (passwordless)
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
    },
    // Sessions
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    // Multi-tenancy via organizations plugin
    plugins: [
      organization({
        // Workspaces = Organizations in Better Auth terms
        async allowUserToCreateOrganization(user) {
          // Custom logic: check subscription limits, etc.
          return true;
        },
      }),
    ],
  });
};
```

### How Identity Domain Changes

Instead of implementing auth by hand, the identity domain becomes **thin wrappers** around Better Auth:

```typescript
// packages/domain/identity/src/entities/user.ts
// User entity remains for business logic reference, but Better Auth owns the table

interface User {
  readonly id: UserId;  // References Better Auth's user.id
  readonly email: Email;
  readonly name: string | null;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Repository port delegates to Better Auth
export interface UserRepository {
  findById(id: UserId): Effect.Effect<User | null, RepositoryError>;
  findByEmail(email: Email): Effect.Effect<User | null, RepositoryError>;
  // Note: create/update handled by Better Auth callbacks/hooks
}
```

**Identity Domain Scope:**
- **Keep**: User entity type, repository port, user-related events
- **Remove**: OAuth logic, session management, magic link implementation
- **Delegate**: All auth operations to Better Auth via Hono middleware

### Implementation Phases (Revised)

#### Phase 1: Shared Kernel Extensions (Foundation)

**Goal:** Establish common domain primitives used across all domains.

**Tasks:**
- Define `EntityId` branded type for type-safe IDs
- Define `WorkspaceScoped` mixin for multi-tenancy
- Define base `DomainError` types using `Data.TaggedError`
- Define common value objects (Email, Timestamp, Money)
- Add validation utilities

**Files:**
- `packages/domain/shared-kernel/src/id.ts`
- `packages/domain/shared-kernel/src/errors.ts`
- `packages/domain/shared-kernel/src/workspace-scoped.ts`
- `packages/domain/shared-kernel/src/validation.ts`

**Acceptance Criteria:**
- [ ] All domains can import common types from shared-kernel
- [ ] Branded ID types prevent mixing different entity IDs
- [ ] Domain errors follow consistent pattern with Effect

#### Phase 2: Better Auth Integration (Identity Foundation)

**Goal:** Integrate Better Auth for authentication instead of hand-rolled auth.

**Tasks:**
- Add `better-auth` and `@better-auth/drizzle-adapter` dependencies
- Create Better Auth instance with Drizzle adapter
- Configure OAuth providers (Google, GitHub)
- Configure organization plugin for multi-tenancy
- Set up Hono middleware for session validation
- Create database schema via Drizzle (Better Auth tables)

**Files:**
- `packages/platform/auth-better/src/index.ts` - Auth factory
- `packages/platform/auth-better/src/middleware.ts` - Hono middleware
- `packages/platform/db-postgres/src/schema/auth.ts` - Better Auth tables
- `apps/api/src/middleware/auth.ts` - Route protection

**Acceptance Criteria:**
- [ ] Better Auth initialized with Drizzle adapter
- [ ] OAuth login works (Google, GitHub)
- [ ] Session middleware validates requests
- [ ] Organization plugin provides workspace management
- [ ] Users table created via Better Auth migrations

#### Phase 3: Workspaces Domain

**Goal:** Implement workspace management on top of Better Auth organizations.

**Key Change**: Workspaces map to Better Auth's "organizations" concept.

**Entities:**
```typescript
// Workspace entity - thin wrapper around Better Auth organization
interface Workspace {
  readonly id: WorkspaceId;  // Maps to organization.id in Better Auth
  readonly name: string;
  readonly creatorId: UserId | null;
  readonly slug: string;  // Better Auth organization slug
  readonly currentSubscriptionId: SubscriptionId | null;
  readonly stripeCustomerId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Membership maps to Better Auth member
interface Membership {
  readonly id: MembershipId;
  readonly workspaceId: WorkspaceId;
  readonly userId: UserId;
  readonly role: 'owner' | 'admin' | 'member';
  readonly invitationToken: string | null;
  readonly confirmedAt: Date | null;
  readonly createdAt: Date;
}
```

**Use Cases:**
- `createWorkspace` - Create Better Auth organization + sync metadata
- `inviteMember` - Use Better Auth's invitation flow
- `acceptInvitation` - Better Auth handles token validation
- `getWorkspaceMembers` - Query via Better Auth API

**Files:**
- `packages/domain/workspaces/src/entities/workspace.ts`
- `packages/domain/workspaces/src/use-cases/*.ts`
- `packages/domain/workspaces/src/events/*.ts`

**Acceptance Criteria:**
- [ ] Workspace creation syncs with Better Auth organization
- [ ] Workspace members map to organization members
- [ ] Invitations handled by Better Auth
- [ ] Roles supported (owner, admin, member)

#### Phase 4: Projects Domain

**Goal:** Implement project management within workspaces.

*(Unchanged from original plan)*

#### Phase 5: API Keys Domain

**Goal:** Implement API key generation and management.

*(Unchanged from original plan)*

#### Phase 6: Subscriptions Domain

**Goal:** Implement subscription plans, billing integration, and quota grants.

*(Unchanged from original plan)*

## Row Level Security (RLS) for Multi-Tenancy

RLS provides **defense-in-depth** for multi-tenancy by enforcing workspace isolation at the database level, even if application code has bugs.

### Why RLS?

Without RLS:
```typescript
// A bug in query building could expose cross-tenant data
const projects = await db.query.projects.findMany({
  where: eq(workspaces.id, wrongWorkspaceId) // Oops, wrong ID!
});
```

With RLS:
```sql
-- Database enforces tenant isolation regardless of query bugs
SELECT * FROM projects;  -- Only returns rows for current workspace
```

### RLS Implementation Strategy

**Approach: Session-based RLS with workspace context**

Postgres RLS policies use `current_setting('app.current_workspace_id')` to filter rows:

```sql
-- Enable RLS on all workspace-scoped tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;

-- Create policy that filters by workspace_id
CREATE POLICY workspace_isolation ON projects
  FOR ALL
  USING (workspace_id = current_setting('app.current_workspace_id')::bigint);

-- Same pattern for other tables...
CREATE POLICY workspace_isolation ON api_keys
  FOR ALL
  USING (workspace_id = current_setting('app.current_workspace_id')::bigint);
```

### Setting Workspace Context

**Option 1: Per-query (Recommended for Effect/TypeScript)**
```typescript
// packages/platform/db-postgres/src/rls.ts
export const withWorkspaceContext = <T>(
  pool: Pool,
  workspaceId: WorkspaceId,
  operation: () => Promise<T>
): Promise<T> => {
  return pool.query('SET LOCAL app.current_workspace_id = $1', [workspaceId])
    .then(() => operation())
    .finally(() => pool.query('RESET app.current_workspace_id'));
};

// Usage in repository
export const createProjectRepository = (pool: Pool): ProjectRepository => ({
  findByWorkspaceId: (workspaceId) => Effect.tryPromise(() =>
    withWorkspaceContext(pool, workspaceId, async () => {
      const result = await db.query.projects.findMany({
        where: eq(projects.workspaceId, workspaceId)
      });
      return result;
    })
  ),
});
```

**Option 2: Connection-level (for long-lived connections)**
```typescript
// Set once per connection, applies to all queries
await client.query('SET app.current_workspace_id = $1', [workspaceId]);
```

### RLS + Better Auth Integration

Better Auth's tables need RLS too:

```sql
-- Enable RLS on Better Auth's organization tables
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE member ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own organizations
CREATE POLICY user_organizations ON organization
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM member 
    WHERE member.organization_id = organization.id 
    AND member.user_id = current_setting('app.current_user_id')::text
  ));
```

### Tables Requiring RLS

| Table | Workspace-scoped | RLS Policy |
|-------|------------------|------------|
| `projects` | ✅ Yes | `workspace_id` filter |
| `api_keys` | ✅ Yes | `workspace_id` filter |
| `subscriptions` | ✅ Yes | `workspace_id` filter |
| `grants` | ✅ Yes | `workspace_id` filter |
| `organization` | ⚠️ Via member | User membership check |
| `member` | ⚠️ Via user_id | User or workspace member check |

### RLS Bypass for Admin Operations

```sql
-- Admin roles can bypass RLS
CREATE ROLE admin BYPASSRLS;

-- Or use SECURITY DEFINER for specific admin functions
CREATE FUNCTION get_all_workspaces_stats()
RETURNS TABLE (...) 
SECURITY DEFINER  -- Bypasses RLS
AS $$
  SELECT * FROM workspaces;  -- Sees all workspaces
$$ LANGUAGE sql;
```

### Testing RLS

```typescript
// Test that RLS prevents cross-tenant access
describe('RLS policies', () => {
  it('should prevent accessing other workspace data', async () => {
    // Set workspace A context
    await setWorkspaceContext(pool, workspaceA.id);
    
    // Query should only return workspace A projects
    const projects = await getProjects();
    expect(projects.every(p => p.workspaceId === workspaceA.id)).toBe(true);
    
    // Try to access workspace B project by ID (should fail or return null)
    const otherProject = await getProjectById(workspaceBProject.id);
    expect(otherProject).toBeNull();
  });
});
```

### Performance Considerations

- RLS adds ~1-5% query overhead (negligible for most apps)
- Ensure `workspace_id` columns are indexed
- Use `SET LOCAL` (transaction-level) not `SET` (session-level) to avoid leaking context

## System-Wide Impact

### Interaction Graph

```
User Registration Flow:
1. OAuth callback triggers findOrCreateUserFromOAuth
2. If new user: UserCreated event published
3. If new user with no workspaces: createWorkspace triggered
4. WorkspaceCreated event published
5. MemberJoined event published (creator joins)

Workspace Invitation Flow:
1. inviteMember generates invitation token
2. MemberInvited event triggers email worker
3. User clicks link, acceptInvitation validates token
4. Membership confirmed, MemberJoined event published

Subscription Flow:
1. createWorkspace subscribes to default plan (HobbyV3)
2. SubscriptionCreated event published
3. GrantIssued events published for seats/runs/credits
4. Grants persisted to quota tracking

API Key Usage:
1. API request authenticated via token
2. findByToken validates API key exists and is active
3. touch updates lastUsedAt
4. Quota consumption checked via subscriptions domain
```

### Error Propagation

| Layer | Error Types | Handling |
|-------|-------------|----------|
| **Domain** | `Data.TaggedError` subclasses | Propagate via Effect error channel |
| **Repository** | `RepositoryError` | Wrap DB errors, typed by cause |
| **Use Cases** | Domain-specific errors | `UserNotFound`, `InvalidToken`, `QuotaExceeded` |
| **API Routes** | HTTP responses | Map to 400/401/403/404/409 status codes |

### State Lifecycle Risks

| Risk | Mitigation |
|------|------------|
| **Orphaned memberships** | Foreign key with cascade delete from users/workspaces |
| **Orphaned API keys** | Foreign key with cascade delete from workspaces |
| **Orphaned projects** | Soft delete + cascade delete from workspaces |
| **Grant inconsistency** | Transactions: issue/revoke grants atomically with subscription changes |
| **Double quota consumption** | Idempotency keys on consumeQuota operations |

### API Surface Parity

All domains expose consistent interfaces:

```typescript
// Repository pattern everywhere
interface Repository<T> {
  findById(id: Id): Effect.Effect<T | null, RepositoryError>;
  save(entity: T): Effect.Effect<void, RepositoryError>;
}

// Use case pattern everywhere
type UseCase<Input, Output, Error> = (input: Input) => Effect.Effect<Output, Error>;

// Event pattern everywhere
interface DomainEvent<TName extends string, TPayload> {
  readonly name: TName;
  readonly workspaceId: string;
  readonly payload: TPayload;
}
```

### Integration Test Scenarios

1. **Full User Onboarding**
   - OAuth callback → user created → workspace created → subscription created → grants issued
   - Verify all events published and persisted

2. **Workspace Invitation Acceptance**
   - Invite sent → email queued → link clicked → membership confirmed
   - Verify invitation token invalidated after use

3. **Subscription Plan Change**
   - Change from HobbyV3 → TeamV4
   - Verify old grants revoked, new grants issued with correct amounts
   - Verify workspace quota recalculated

4. **API Key Quota Enforcement**
   - API request with valid key
   - Verify quota consumed from active grant
   - Verify 429 response when quota exhausted

5. **Cross-Domain Event Consistency**
   - Delete workspace with members, projects, API keys, subscriptions
   - Verify all related data cascade deleted or soft deleted
   - Verify events published for all deletions

## Database Schema (Postgres)

### Tables Overview

**Better Auth Managed Tables:**
- `user` - User accounts (Better Auth creates this)
- `account` - OAuth provider accounts
- `session` - Active sessions
- `verification` - Email verification tokens
- `organization` - Workspaces (via organization plugin)
- `member` - Workspace memberships
- `invitation` - Pending workspace invitations

**Application Tables:**
- `workspaces` - Workspace metadata (synced with organization)
- `projects` - Workspace projects (RLS protected)
- `api_keys` - API access tokens (RLS protected)
- `subscriptions` - Billing subscriptions (RLS protected)
- `grants` - Quota allocations (RLS protected)

### Better Auth Tables

Better Auth's Drizzle adapter creates these automatically:

```sql
-- Better Auth core tables (auto-created by adapter)
CREATE TABLE "user" (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  name TEXT,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "account" (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "session" (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

-- Better Auth organization plugin tables (workspaces)
CREATE TABLE "organization" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata TEXT
);

CREATE TABLE "member" (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE TABLE "invitation" (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  inviter_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
```

### Application Tables

```sql
-- Workspaces metadata (syncs with Better Auth organization)
CREATE TABLE workspaces (
  id BIGSERIAL PRIMARY KEY,
  organization_id TEXT UNIQUE REFERENCES "organization"(id) ON DELETE CASCADE,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  creator_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  current_subscription_id BIGINT,
  stripe_customer_id VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects - RLS protected
CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(256) NOT NULL,
  deleted_at TIMESTAMPTZ,
  last_edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API Keys - RLS protected
CREATE TABLE api_keys (
  id BIGSERIAL PRIMARY KEY,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(256),
  last_used_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subscriptions - RLS protected
CREATE TYPE subscription_plan AS ENUM (
  'hobby_v3', 'team_v4', 'enterprise_v1', 'scale_v1'
);

CREATE TABLE subscriptions (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan subscription_plan NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grants - RLS protected
CREATE TYPE quota_type AS ENUM ('seats', 'runs', 'credits');
CREATE TYPE grant_source AS ENUM ('subscription', 'purchase', 'promocode');

CREATE TABLE grants (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  source grant_source NOT NULL,
  type quota_type NOT NULL,
  amount BIGINT,  -- NULL means unlimited
  balance BIGINT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for RLS performance
CREATE INDEX idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX idx_api_keys_workspace_id ON api_keys(workspace_id);
CREATE INDEX idx_subscriptions_workspace_id ON subscriptions(workspace_id);
CREATE INDEX idx_grants_workspace_id ON grants(workspace_id);
```

### Row Level Security (RLS) Policies

```sql
-- Enable RLS on all workspace-scoped tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Create helper function to get current workspace from session
CREATE OR REPLACE FUNCTION get_current_workspace_id()
RETURNS BIGINT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_workspace_id', true), '')::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies for projects
CREATE POLICY workspace_isolation_projects ON projects
  FOR ALL
  USING (workspace_id = get_current_workspace_id());

-- Policies for api_keys
CREATE POLICY workspace_isolation_api_keys ON api_keys
  FOR ALL
  USING (workspace_id = get_current_workspace_id());

-- Policies for subscriptions
CREATE POLICY workspace_isolation_subscriptions ON subscriptions
  FOR ALL
  USING (workspace_id = get_current_workspace_id());

-- Policies for grants
CREATE POLICY workspace_isolation_grants ON grants
  FOR ALL
  USING (workspace_id = get_current_workspace_id());

-- Workspaces policy - users can only see their own workspaces
CREATE POLICY user_workspaces ON workspaces
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM member m
      JOIN organization o ON m.organization_id = o.id
      WHERE o.id = workspaces.organization_id
      AND m.user_id = current_setting('app.current_user_id', true)
    )
  );

-- Bypass RLS for admin role
CREATE ROLE latitude_admin BYPASSRLS;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO latitude_admin;
```

### Drizzle Schema Files

Each table gets a Drizzle ORM definition in `packages/platform/db-postgres/src/schema/`:

**Better Auth tables (via adapter):**
- Auto-generated by Better Auth's Drizzle adapter

**Application tables:**
- `packages/platform/db-postgres/src/schema/workspaces.ts`
- `packages/platform/db-postgres/src/schema/projects.ts`
- `packages/platform/db-postgres/src/schema/api-keys.ts`
- `packages/platform/db-postgres/src/schema/subscriptions.ts`
- `packages/platform/db-postgres/src/schema/grants.ts`
- `packages/platform/db-postgres/src/schema/index.ts`  # Re-exports all schemas

**RLS utilities:**
- `packages/platform/db-postgres/src/rls.ts` - Helper functions for RLS context

CREATE TYPE quota_type AS ENUM ('seats', 'runs', 'credits');
CREATE TYPE grant_source AS ENUM ('subscription', 'purchase', 'promocode');

CREATE TABLE grants (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  source grant_source NOT NULL,
  type quota_type NOT NULL,
  amount BIGINT,  -- NULL means unlimited
  balance BIGINT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Drizzle Schema Files

Each table gets a Drizzle ORM definition in `packages/platform/db-postgres/src/schema/`:

- `packages/platform/db-postgres/src/schema/users.ts`
- `packages/platform/db-postgres/src/schema/oauth-accounts.ts`
- `packages/platform/db-postgres/src/schema/magic-link-tokens.ts`
- `packages/platform/db-postgres/src/schema/sessions.ts`
- `packages/platform/db-postgres/src/schema/workspaces.ts`
- `packages/platform/db-postgres/src/schema/memberships.ts`
- `packages/platform/db-postgres/src/schema/projects.ts`
- `packages/platform/db-postgres/src/schema/api-keys.ts`
- `packages/platform/db-postgres/src/schema/subscriptions.ts`
- `packages/platform/db-postgres/src/schema/grants.ts`

## Acceptance Criteria

### Functional Requirements

- [ ] Users can register via OAuth (Google, GitHub) using Better Auth
- [ ] Users can authenticate via magic link (passwordless) via Better Auth
- [ ] Sessions managed by Better Auth with configurable expiration
- [ ] Users can create workspaces (Better Auth organizations)
- [ ] Workspace creators automatically become confirmed members (Better Auth owner role)
- [ ] Users can invite others to workspaces via email (Better Auth invitations)
- [ ] Invited users can accept invitations via unique token (Better Auth flow)
- [ ] Workspace members can be removed (Better Auth member management)
- [ ] Projects can be created within workspaces
- [ ] Projects support soft delete and restore
- [ ] API keys can be generated for workspace access
- [ ] API keys can be revoked
- [ ] Workspaces have subscriptions with plans
- [ ] Subscriptions issue grants for seats, runs, and credits
- [ ] Quota consumption tracked against grant balances
- [ ] Plan changes revoke old grants and issue new ones
- [ ] Cross-tenant data access prevented by RLS policies at database level

### Non-Functional Requirements

- [ ] All domain logic uses Effect TS for composable error handling
- [ ] All repository operations return `Effect.Effect<T, RepositoryError>`
- [ ] All use cases use `Effect.gen` for sequential composition
- [ ] Domain events published via outbox pattern for reliability
- [ ] **RLS enabled on all workspace-scoped tables** (projects, api_keys, subscriptions, grants)
- [ ] **RLS policies prevent cross-tenant data access** even with buggy queries
- [ ] Multi-tenancy enforced via workspaceId on all queries (application layer)
- [ ] RLS enforced at database level (defense-in-depth)
- [ ] Soft deletes used for recoverable data (projects, API keys)
- [ ] Hard deletes with cascade for referential integrity
- [ ] Typed errors prevent mixing different error types
- [ ] Readonly entities enforce immutability
- [ ] Better Auth integration uses Drizzle adapter with custom hooks

### Quality Gates

- [ ] Unit tests for all use cases with in-memory repositories
- [ ] Contract tests for Postgres adapters
- [ ] Integration tests for cross-domain flows
- [ ] **RLS integration tests verify cross-tenant isolation**
- [ ] TypeScript strict mode compliance
- [ ] Biome lint/format passing
- [ ] No business logic in app routes (only routing/auth/validation)
- [ ] Domain packages have no imports from platform packages
- [ ] Better Auth hooks/event handlers tested

## Success Metrics

- All baseline domains implemented with full test coverage
- API routes can perform CRUD operations on all entities
- Workers process events reliably via outbox pattern
- Quota enforcement prevents exceeding plan limits
- End-to-end onboarding flow works: OAuth → User → Workspace → Subscription → API Key

## Dependencies & Prerequisites

- ✅ Postgres adapter (packages/platform/db-postgres) - EXISTS
- ✅ Redis adapter (packages/platform/cache-redis) - EXISTS
- ✅ Queue adapter (packages/platform/queue-bullmq) - EXISTS
- ✅ Events outbox (packages/platform/events-outbox) - EXISTS
- ✅ Events domain (packages/domain/events) - EXISTS
- ✅ Shared kernel (packages/domain/shared-kernel) - EXISTS (needs extension)
- ⬜ Email service (needed for magic links/invitations via Better Auth) - FUTURE
- ⬜ Stripe integration (needed for billing) - FUTURE

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Better Auth integration complexity** | Medium | Medium | Use official Drizzle adapter, follow docs, test all auth flows |
| **RLS performance overhead** | Low | Low | Benchmark early, index workspace_id columns, use SET LOCAL |
| **RLS policy bugs** | Medium | High | Comprehensive RLS integration tests, test cross-tenant access attempts |
| **Complex domain interactions** | High | Medium | Clear event-driven boundaries, comprehensive integration tests |
| **Quota calculation bugs** | Medium | High | Extensive unit tests, idempotency keys, audit logging |
| **Auth security issues** | Low | High | Better Auth handles OAuth/security, we configure securely |
| **Data migration from legacy** | High | High | Plan migration strategy separately, maintain backward compatibility |
| **Circular dependencies between domains** | Low | Medium | Shared kernel for common types, clear domain boundaries |

## Implementation Order

**Recommended sequence:**

1. **Shared kernel extensions** - Foundation for all domains (branded IDs, errors)
2. **Better Auth integration** - Auth foundation using Better Auth with Drizzle adapter
3. **RLS infrastructure** - Add RLS helpers and policies to db-postgres
4. **Workspaces domain** - Built on Better Auth organizations
5. **Projects domain** - Simple, RLS-protected
6. **API Keys domain** - RLS-protected, needed for API access
7. **Subscriptions domain** - Complex, RLS-protected, quota management

**Each phase includes:**
- Domain entities and types
- Repository ports (interfaces) with RLS context
- Postgres adapters (implementations with RLS)
- Use cases (business logic)
- Domain events
- Unit tests (with RLS context mocking)
- Integration tests (with real RLS policies)
- Unit tests

## File Structure Summary

```
packages/domain/
├── shared-kernel/
│   └── src/
│       ├── index.ts
│       ├── id.ts              # Branded ID types
│       ├── errors.ts          # Base error types
│       ├── workspace-scoped.ts
│       └── validation.ts
├── identity/                   # Thin layer over Better Auth
│   └── src/
│       ├── index.ts
│       ├── entities/
│       │   └── user.ts        # User type for domain reference
│       ├── ports/
│       │   └── user-repository.ts  # Delegates to Better Auth
│       └── events/
│           ├── user-created.ts
│           └── user-logged-in.ts
├── workspaces/                 # Built on Better Auth organizations
│   └── src/
│       ├── index.ts
│       ├── entities/
│       │   ├── workspace.ts   # Syncs with organization
│       │   └── membership.ts  # References Better Auth member
│       ├── ports/
│       │   ├── workspace-repository.ts
│       │   └── membership-repository.ts
│       ├── use-cases/
│       │   ├── create-workspace.ts    # Creates org + syncs metadata
│       │   ├── invite-member.ts      # Uses Better Auth invitations
│       │   ├── accept-invitation.ts  # Delegated to Better Auth
│       │   ├── remove-member.ts
│       │   └── get-workspace-members.ts
│       └── events/
│           ├── workspace-created.ts
│           ├── member-invited.ts
│           └── member-joined.ts
├── projects/
│   └── src/
│       ├── index.ts
│       ├── entities/
│       │   └── project.ts
│       ├── ports/
│       │   └── project-repository.ts   # RLS-enabled
│       ├── use-cases/
│       │   ├── create-project.ts
│       │   ├── update-project.ts
│       │   ├── delete-project.ts
│       │   ├── restore-project.ts
│       │   └── list-projects.ts
│       └── events/
│           ├── project-created.ts
│           ├── project-updated.ts
│           └── project-deleted.ts
├── api-keys/
│   └── src/
│       ├── index.ts
│       ├── entities/
│       │   └── api-key.ts
│       ├── ports/
│       │   └── api-key-repository.ts   # RLS-enabled
│       ├── use-cases/
│       │   ├── generate-api-key.ts
│       │   ├── revoke-api-key.ts
│       │   ├── list-api-keys.ts
│       │   └── record-usage.ts
│       └── events/
│           ├── api-key-created.ts
│           └── api-key-revoked.ts
└── subscriptions/
    └── src/
        ├── index.ts
        ├── entities/
        │   ├── subscription.ts
        │   ├── grant.ts
        │   └── plan.ts
        ├── ports/
        │   ├── subscription-repository.ts   # RLS-enabled
        │   └── grant-repository.ts          # RLS-enabled
        ├── use-cases/
        │   ├── subscribe.ts
        │   ├── change-plan.ts
        │   ├── cancel-subscription.ts
        │   ├── get-workspace-quota.ts
        │   ├── consume-quota.ts
        │   └── issue-grants.ts
        ├── events/
        │   ├── subscription-created.ts
        │   ├── subscription-changed.ts
        │   ├── grant-issued.ts
        │   └── quota-consumed.ts
        └── plans.ts

packages/platform/
├── auth-better/               # NEW: Better Auth integration
│   └── src/
│       ├── index.ts           # Auth factory
│       ├── middleware.ts      # Hono session middleware
│       └── hooks.ts           # Better Auth event hooks
├── db-postgres/
│   └── src/
│       ├── client.ts          # Postgres pool management
│       ├── rls.ts             # NEW: RLS context helpers
│       ├── health.ts
│       └── schema/
│           ├── index.ts
│           ├── workspaces.ts
│           ├── projects.ts
│           ├── api-keys.ts
│           ├── subscriptions.ts
│           ├── grants.ts
│           └── rls-policies.sql   # RLS policies
├── db-clickhouse/
├── cache-redis/
├── queue-bullmq/
├── events-outbox/
├── storage-object/
└── env/

apps/
├── api/
│   └── src/
│       ├── server.ts
│       ├── clients.ts
│       ├── middleware/
│       │   ├── auth.ts        # NEW: Better Auth + RLS middleware
│       │   └── workspace.ts   # NEW: Workspace context
│       └── routes/
│           ├── index.ts
│           ├── health.ts
│           └── auth.ts        # NEW: Better Auth routes
├── ingest/
├── workers/
├── workflows/
└── web/
    └── src/
        └── lib/
            └── auth.ts        # NEW: Better Auth client setup
```
        │   ├── change-plan.ts
        │   ├── cancel-subscription.ts
        │   ├── get-workspace-quota.ts
        │   ├── consume-quota.ts
        │   └── issue-grants.ts
        ├── events/
        │   ├── subscription-created.ts
        │   ├── subscription-changed.ts
        │   ├── grant-issued.ts
        │   └── quota-consumed.ts
        └── plans.ts

packages/platform/db-postgres/src/schema/
├── users.ts
├── oauth-accounts.ts
├── magic-link-tokens.ts
├── sessions.ts
├── workspaces.ts
├── memberships.ts
├── projects.ts
├── api-keys.ts
├── subscriptions.ts
├── grants.ts
└── index.ts  # Re-exports all schemas
```

## Sources & References

### Legacy Domain Models

Based on comprehensive analysis of `/home/geclos/code/work/latitude-legacy`:

- **Workspace schema:** `packages/core/src/schema/models/workspaces.ts`
- **User schema:** `packages/core/src/schema/models/users.ts`
- **API Key schema:** `packages/core/src/schema/models/apiKeys.ts`
- **Project schema:** `packages/core/src/schema/models/projects.ts`
- **Subscription schema:** `packages/core/src/schema/models/subscriptions.ts`
- **Membership schema:** `packages/core/src/schema/models/memberships.ts`
- **Grant schema:** `packages/core/src/schema/models/grants.ts`
- **OAuth schema:** `packages/core/src/schema/models/oauthAccounts.ts`
- **Magic link schema:** `packages/core/src/schema/models/magicLinkTokens.ts`
- **Session schema:** `packages/core/src/schema/models/sessions.ts`

### Existing Patterns

- **Domain events:** `packages/domain/events/src/index.ts`
- **Effect patterns:** Research findings from codebase analysis
- **Repository pattern:** Inferred from platform/db-postgres patterns
- **Error handling:** Using `Data.TaggedError` pattern

### Authentication (Better Auth)

- **Better Auth:** https://www.better-auth.com/ - Comprehensive TypeScript auth framework
- **Better Auth Documentation:** https://www.better-auth.com/docs - Integration guides
- **Better Auth Drizzle Adapter:** https://www.better-auth.com/docs/adapters/drizzle
- **Organization Plugin:** https://www.better-auth.com/docs/plugins/organization - Multi-tenancy
- **Why Better Auth in 2026:** Most comprehensive, framework-agnostic, acquired Auth.js ecosystem

### Row Level Security (RLS)

- **PostgreSQL RLS Documentation:** https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- **RLS Best Practices:** Defense-in-depth for multi-tenancy
- **RLS Performance:** Minimal overhead (~1-5%), requires proper indexing

### V2 Plan

- **Reference:** `V2_PLAN.md` - Phase 1: "Implement baseline domains and contracts"
- **Domains to implement:** workspaces, users, api keys, auth (bundled), projects, subscriptions
- **Architecture:** Domain packages with ports/adapters pattern

## AI-Era Considerations

### Development Approach

This implementation will leverage AI pair programming for:
1. **Boilerplate generation** - Domain entity types, repository interfaces
2. **Pattern replication** - Ensuring consistency across all 5 new domain packages
3. **Test generation** - Unit test scaffolding for use cases
4. **Documentation** - Keeping this plan updated with implementation details

### Quality Assurance

Given the accelerated development pace:
- **Comprehensive testing is critical** - All use cases must have unit tests
- **Contract tests for adapters** - Verify Postgres implementations match ports
- **Integration tests for flows** - Cross-domain scenarios (onboarding, invitations)
- **RLS integration tests mandatory** - Verify cross-tenant isolation at database level
- **Better Auth security testing** - Test all OAuth flows, session handling, CSRF protection
- **Manual review of auth logic** - Security-sensitive code requires human review
- **Type safety as guardrail** - Leverage TypeScript strict mode to catch issues

### AI-Era Specific Notes

**Better Auth Integration:**
- AI can generate the configuration boilerplate and Drizzle schema setup
- Human review required for: OAuth provider configs, session security settings, hook handlers
- Test all auth flows manually: sign-up, sign-in, sign-out, session refresh

**RLS Implementation:**
- AI can generate the policy SQL and TypeScript helpers
- Human review required for: Policy correctness, bypass scenarios, admin roles
- RLS integration tests cannot be AI-generated - must verify actual isolation

### Code Review Strategy

- AI-generated domain entities and types: Lower risk, pattern-based
- AI-generated use case logic: Medium risk, verify business rules
- AI-generated repository adapters: Lower risk, follows established patterns
- **Manual review required:** Auth flows, quota calculations, event publishing
