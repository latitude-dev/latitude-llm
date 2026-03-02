---
title: Add Integration Tests to @app/api Endpoints
type: feat
status: active
date: 2026-03-02
---

# Add Integration Tests to @app/api Endpoints

## Overview

Establish comprehensive integration testing infrastructure for the `@app/api` application. This is the first test suite for the API, requiring careful setup of test tooling, patterns, and infrastructure. All test utilities must be centralized in a new `packages/platform/testkit` package for reuse across the monorepo.

## Problem Statement

The `@app/api` application currently has **zero tests** despite having multiple production endpoints handling authentication, organizations, projects, and API keys. This creates risk:

- No regression protection when adding features
- No validation of authentication/authorization middleware
- No verification of database integration and SQL queries
- No confirmation of cross-tenant access controls
- No performance baselines for cached operations

**Current State:**
- Test runner: Vitest 3.2.4 configured in `packages/vitest-config/index.ts`
- Test command: `vitest run --passWithNoTests` (currently passing with no tests)
- No existing `*.test.ts` or `*.spec.ts` files in `apps/api/src/`

## Proposed Solution

Create a three-layer testing approach:

1. **Testkit Package** (`packages/platform/testkit`): Centralized testing utilities
2. **Integration Tests** (`apps/api/src/**/*.test.ts`): Endpoint-level tests with real dependencies
3. **Test Infrastructure**: Database fixtures, testcontainers or test database setup, auth helpers

### Testing Strategy

**Phase 1: Testkit Foundation**
- Create `packages/platform/testkit` package
- Provide test database lifecycle management
- Build Hono app test harness
- Create auth context helpers
- Add test fixtures/factories

**Phase 2: Health Endpoint (Proof of Concept)**
- Test the simplest endpoint first
- Validates testkit approach
- Tests Postgres + ClickHouse connectivity
- Establishes pattern for other tests

**Phase 3: Protected Routes**
- Organization CRUD operations
- Authentication middleware validation
- Cross-tenant access prevention
- Rate limiting verification

**Phase 4: Auth Routes**
- Better Auth integration testing
- Sign-up/sign-in flows
- OAuth callback handling

## Technical Considerations

### Architecture Impacts

**New Package:** `packages/platform/testkit`
```
packages/platform/testkit/
├── package.json
├── src/
│   ├── index.ts              # Public API exports
│   ├── database/
│   │   ├── test-database.ts   # Test DB lifecycle
│   │   ├── fixtures.ts        # Test data factories
│   │   └── migrations.ts      # Test schema setup
│   ├── hono/
│   │   └── test-client.ts     # Hono app test harness
│   ├── auth/
│   │   └── auth-helpers.ts    # JWT/API key generation for tests
│   └── redis/
│       └── test-redis.ts      # Test Redis setup
```

**Integration Test Location:**
- Co-locate tests with source: `apps/api/src/routes/health.test.ts`
- Follow Vitest convention: `*.test.ts` alongside implementation

### Implementation Patterns

**Hono App Testing (no server required):**
```typescript
// Pattern from Hono docs - use app.fetch() directly
const app = new Hono()
registerRoutes({ app })
const res = await app.fetch(new Request('http://localhost/health'))
```

**Effect TS Testing:**
```typescript
// All async code uses Effect - unwrap with Effect.runPromise
const result = await Effect.runPromise(effect)
// Or test error cases
const either = await Effect.runPromise(Effect.either(effect))
```

**Database Testing:**
- Option A: Testcontainers with ephemeral Postgres/Redis
- Option B: Dedicated test database with transaction rollback
- Option C: Test database with cleanup (truncate between tests)

**Auth Testing:**
- Generate valid JWTs using Better Auth test utilities
- Create API keys via repository directly
- Test both authenticated and unauthenticated requests

### Performance Implications

- Integration tests will be slower than unit tests (~100-500ms per test)
- Use `beforeAll` for expensive setup (DB connection, migrations)
- Use `beforeEach` for test isolation (transaction rollback or cleanup)
- Parallel test execution must handle resource isolation

## System-Wide Impact

### Interaction Graph

```
Integration Test
  → Test Database (Postgres)
    → Drizzle ORM migrations
    → Test fixtures seeded
  → Test Redis (if needed)
    → Connection established
  → Hono App
    → registerRoutes()
      → Middleware (auth, rate limiter)
        → Repository calls
          → Database queries
    → Route handlers
      → Domain use-cases
        → Repositories
          → Database
  → Response validation
    → Status code assertions
    → Body shape validation
    → Header checks (rate limits, etc.)
```

### Error Propagation

Tests must handle Effect error channels:
- Domain errors (NotFoundError, BadRequestError)
- Repository errors (connection failures, constraint violations)
- HTTP errors (from middleware - rate limiting, auth failures)

Use `Effect.either` to test error cases explicitly.

### State Lifecycle Risks

**Test Isolation Requirements:**
- Database state must not leak between tests
- Redis cache must be cleared between tests
- API key rate limit counters must reset

**Mitigation Strategies:**
- Wrap each test in a database transaction, rollback after
- OR: Truncate tables in `afterEach`
- OR: Use unique identifiers per test (timestamp + random suffix)

### API Surface Parity

All endpoints must have integration tests:
- `/health` - Health check
- `/v1/auth/*` - Better Auth routes
- `/v1/organizations` - Organization CRUD
- `/v1/organizations/:id/projects` - Project CRUD
- `/v1/organizations/:id/api-keys` - API key management

### Integration Test Scenarios

**Critical cross-layer scenarios:**

1. **Authentication Flow**
   - Sign up → Sign in → Access protected endpoint → Verify JWT validation
   - Cross-layer: Better Auth → JWT middleware → Route handler

2. **Cross-Tenant Access Prevention**
   - Create org A with user 1 → Create org B with user 2
   - User 1 tries to access org B's resources → Should get 403/404
   - Cross-layer: Auth middleware → Membership repository → Organization repository

3. **API Key Rate Limiting**
   - Create API key → Make 10 rapid requests → 11th request should be rate limited (429)
   - Cross-layer: Rate limiter middleware → Redis → Response headers

4. **Database Constraint Validation**
   - Create organization with duplicate slug → Should fail with unique constraint error
   - Verify error response format matches API contract
   - Cross-layer: Route handler → Repository → Postgres → Error handler

5. **Touch Buffer Batching**
   - Make 100 requests with same API key → Verify only 3-4 database writes for `lastUsedAt`
   - Cross-layer: Auth middleware → Touch buffer → Repository → Database

## Acceptance Criteria

### Foundation (Must Have)

- [ ] Create `packages/platform/testkit` package with:
  - [ ] Test database setup/teardown utilities
  - [ ] Database fixture/factory functions
  - [ ] Hono test client helper
  - [ ] Auth context helpers (JWT generation, API key creation)
- [ ] Configure `apps/api` to run integration tests with Vitest
- [ ] Health endpoint integration tests passing
- [ ] At least one protected route integration test passing
- [ ] Cross-tenant access prevention test passing

### Core Implementation (Should Have)

- [ ] All `/v1/organizations` endpoints have integration tests
- [ ] All `/v1/organizations/:id/projects` endpoints have integration tests
- [ ] All `/v1/organizations/:id/api-keys` endpoints have integration tests
- [ ] Authentication middleware tests (valid/invalid API key, JWT, rate limiting)
- [ ] Test database uses transactions for isolation (fastest approach)

### Polish (Nice to Have - Future Work)

- [ ] CI workflow updated to run API integration tests
- [ ] Auth routes integration tests (Better Auth integration)
- [ ] Performance benchmarks for cached vs uncached operations
- [ ] Rate limiting verification tests
- [ ] Test coverage reporting configured
- [ ] Documentation on testing patterns in AGENTS.md

### Quality Gates

- [ ] All tests run in CI and pass
- [ ] Test database setup/teardown < 2 seconds per test file
- [ ] No test interdependencies (tests can run in any order)
- [ ] Tests use type-safe assertions (no `any` types)
- [ ] Error cases explicitly tested (not just happy path)

## Success Metrics

- **Test Coverage:** Minimum 80% of API endpoints covered by integration tests
- **Test Duration:** Full API test suite runs in < 60 seconds
- **Test Reliability:** Tests pass consistently (flake rate < 1%)
- **Test Isolation:** No test interdependencies, can run in parallel

## Dependencies & Risks

### Dependencies

- Vitest 3.2.4 (already available)
- Postgres test database (could use existing DB with separate schema)
- Redis (optional - could mock for first iteration)
- Better Auth test utilities

### Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Test flakiness due to async timing | Medium | Use explicit assertions, avoid `setTimeout` in tests, use Effect's structured concurrency |
| Database state leaking between tests | High | Transaction rollback or unique identifiers per test |
| Slow test execution | Medium | Parallel execution, connection pooling, minimize DB resets |
| Better Auth testing complexity | Medium | Use Better Auth's test utilities, mock OAuth providers |
| CI resource constraints | Low | Use testcontainers if local, dedicated test DB in CI |

## Implementation Phases

### Phase 1: Testkit Foundation (2-3 days)

**Tasks:**
1. Create `packages/platform/testkit` package structure
2. Implement test database lifecycle management
3. Create fixture/factory functions for users, organizations, projects, API keys
4. Build Hono test harness for request/response handling
5. Add auth helpers for generating test JWTs and API keys

**Deliverables:**
- `packages/platform/testkit/src/index.ts` with exported utilities
- Test database setup working in local environment
- Example fixture usage documented

**Success Criteria:**
- Can create a test database connection
- Can seed test data via fixtures
- Can make requests to Hono app without running server

### Phase 2: Health Endpoint Tests (1 day)

**Tasks:**
1. Create `apps/api/src/routes/health.test.ts`
2. Test successful health check (Postgres + ClickHouse up)
3. Test degraded health check (one dependency down)
4. Test response format matches contract

**Deliverables:**
- `apps/api/src/routes/health.test.ts` with passing tests
- Pattern established for route testing

**Success Criteria:**
- Tests pass locally and in CI
- Demonstrate database interaction in tests

### Phase 3: Protected Routes - Organizations (2-3 days)

**Tasks:**
1. Create `apps/api/src/routes/organizations.test.ts`
2. Test POST /organizations (create)
3. Test GET /organizations (list)
4. Test GET /organizations/:id (get by ID)
5. Test GET /organizations/:id/members
6. Test DELETE /organizations/:id
7. Test cross-tenant access prevention (critical security test)
8. Test auth middleware rejection (no token, invalid token)

**Deliverables:**
- Comprehensive organization route tests
- Auth middleware testing patterns

**Success Criteria:**
- All CRUD operations tested
- Auth validation tested
- Cross-tenant access blocked and tested

### Phase 4: Protected Routes - Projects & API Keys (2-3 days)

**Tasks:**
1. Create `apps/api/src/routes/projects.test.ts`
2. Create `apps/api/src/routes/api-keys.test.ts`
3. Follow patterns from Phase 3
4. Add rate limiting tests for API key routes

**Deliverables:**
- Project route tests
- API key route tests
- Rate limiting verification

### Phase 5: Auth Routes (Optional - Skipped for Now)

**Status:** Out of scope for initial implementation.

This phase can be addressed later when needed. Auth routes require Better Auth integration testing which may need external OAuth provider mocking.

**Future Tasks:**
1. Create `apps/api/src/routes/auth.test.ts`
2. Test Better Auth integration
3. Test sign-up flow
4. Test sign-in flow

### Phase 6: CI Integration & Documentation (Optional - Skipped for Now)

**Status:** Out of scope for initial implementation.

**Future Tasks:**
1. Update CI workflow to run API tests
2. Add test database setup to CI
3. Document testing patterns in AGENTS.md
4. Create example test as template for future tests

## Sources & References

### Internal References

- **Vitest config:** `packages/vitest-config/index.ts` - Shared test configuration
- **Server entry:** `apps/api/src/server.ts` - Hono app setup
- **Route registration:** `apps/api/src/routes/index.ts` - How routes are wired
- **Health route:** `apps/api/src/routes/health.ts` - Simplest endpoint (start here)
- **Organizations route:** `apps/api/src/routes/organizations.ts` - Protected route pattern
- **Client singletons:** `apps/api/src/clients.ts` - Database connections
- **Auth middleware:** `apps/api/src/middleware/auth.ts` - Critical to test

### Testing Patterns from Learnings

- **Security test patterns** (from `docs/solutions/security-issues/comprehensive-authentication-middleware-implementation-2026-03-02.md`):
  - Cross-tenant access blocking tests (lines 524-554)
  - Timing attack mitigation tests
  - Rate limiting enforcement tests (429 status after threshold)
  - Cache performance tests (<10ms for cached lookups)
  - Batch write optimization tests (100 requests → 3-4 DB writes)

### External References

- **Vitest docs:** https://vitest.dev/
- **Hono testing:** https://hono.dev/docs/guides/testing
- **Better Auth testing:** https://www.better-auth.com/docs/concepts/testing
- **Effect testing patterns:** https://effect.website/docs/guides/observability/testing

## File Structure

```
apps/api/src/
├── routes/
│   ├── health.test.ts           # Phase 2
│   ├── organizations.test.ts    # Phase 3
│   ├── projects.test.ts         # Phase 4
│   ├── api-keys.test.ts         # Phase 4
│   └── auth.test.ts             # Phase 5 (optional)
└── middleware/
    └── auth.test.ts             # Phase 3 (auth middleware tests)

packages/platform/testkit/
├── package.json
├── src/
│   ├── index.ts
│   ├── database/
│   │   ├── test-database.ts
│   │   ├── fixtures.ts          # Factories for test data
│   │   └── cleanup.ts           # Transaction rollback/cleanup
│   ├── hono/
│   │   └── test-client.ts      # Hono app request helper
│   ├── auth/
│   │   └── auth-helpers.ts     # JWT/API key test utilities
│   └── redis/
│       └── test-redis.ts       # Test Redis setup
```

## MVP Test Example

### apps/api/src/routes/health.test.ts

```typescript
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { registerHealthRoute } from "./health.ts";
import { setupTestDatabase, teardownTestDatabase } from "@platform/testkit";

describe("GET /health", () => {
  let app: Hono;
  let db: TestDatabase;

  beforeAll(async () => {
    db = await setupTestDatabase();
    app = new Hono();
    registerHealthRoute({ app });
  });

  afterAll(async () => {
    await teardownTestDatabase(db);
  });

  it("should return 200 when all dependencies are healthy", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body).toMatchObject({
      service: "api",
      status: "ok",
      postgres: { ok: true },
      clickhouse: { ok: true },
    });
  });
});
```

## Future Considerations

- **Contract Testing:** Consider adding Pact or similar for consumer-driven contract tests
- **Performance Testing:** Add k6 or Artillery tests for load testing critical paths
- **E2E Testing:** Consider Playwright or Cypress for full browser-based flows
- **Mutation Testing:** Add Stryker to verify test quality
- **Property-Based Testing:** Use fast-check for generating test cases
