# @platform/testkit

Testing utilities for the Latitude API and platform packages.

## Overview

This package provides centralized test tooling for integration tests across the monorepo. It includes:

- **Database fixtures** - Factory functions for creating test data
- **Test database management** - Connection lifecycle helpers
- **Hono test client** - HTTP testing without starting a server
- **Auth helpers** - Utilities for generating test authentication

## Environment Configuration

Tests automatically load environment variables from `.env.test` at the repository root. This file is configured with test-specific database credentials and settings.

### Default Test Configuration

The `.env.test` file includes:
- **DATABASE_URL**: Points to `latitude_test` database
- **REDIS_HOST/PORT**: Local Redis instance
- **CLICKHOUSE_URL**: Local ClickHouse instance
- Lower connection pool limits (5 instead of 20)

### Setting Up Test Database

1. **Create the test database:**
   ```bash
   createdb latitude_test
   ```

2. **Run migrations:**
   ```bash
   cd packages/platform/db-postgres
   DATABASE_URL=postgres://user:pass@localhost:5432/latitude_test npx drizzle-kit migrate
   ```

3. **Verify environment loading:**
   ```bash
   pnpm --filter @app/api test -- src/routes/health.test.ts
   ```

   You should see: `[dotenv@17.3.1] injecting env (24) from ../../.env.test`

### Custom Test Environment

To use a different test database, either:
1. Edit `.env.test` at the repo root
2. Or set environment variables before running tests:
   ```bash
   export DATABASE_URL=postgres://user:pass@localhost:5432/my_test_db
   pnpm --filter @app/api test
   ```

## Usage

### Basic Test Setup

```typescript
import { describe, it, beforeAll, afterAll } from "vitest";
import {
  createTestDatabase,
  closeTestDatabase,
  createOrganizationSetup,
  createApiKeyFixture,
  createApiKeyAuthHeaders,
} from "@platform/testkit";
import { Effect } from "effect";

describe("My Tests", () => {
  let testDb: TestDatabase;

  beforeAll(() => {
    testDb = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(testDb);
  });

  it("should test something", async () => {
    const setup = await Effect.runPromise(
      createOrganizationSetup(testDb)
    );
    // ... test code
  });
});
```

### Environment Variables

Tests require the following environment variables:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
```

## API Reference

### Database Fixtures

#### `createUserFixture(db, input?)`
Creates a test user in the database.

```typescript
const user = await Effect.runPromise(
  createUserFixture(testDb.db, {
    email: "test@example.com",
    name: "Test User",
  })
);
```

#### `createOrganizationFixture(db, input?)`
Creates a test organization.

```typescript
const org = await Effect.runPromise(
  createOrganizationFixture(testDb.db, {
    name: "Test Org",
    slug: "test-org",
  })
);
```

#### `createOrganizationSetup(testDb)`
Creates a complete organization with owner user and membership.

```typescript
const { user, organization, membership } = await Effect.runPromise(
  createOrganizationSetup(testDb)
);
```

#### `createApiKeyFixture(db, input)`
Creates an API key for authentication testing.

```typescript
const apiKey = await Effect.runPromise(
  createApiKeyFixture(testDb.db, {
    organizationId: organization.id,
    name: "Test Key",
  })
);
```

### Auth Helpers

#### `createApiKeyAuthHeaders(token)`
Generates headers for API key authentication.

```typescript
const headers = createApiKeyAuthHeaders(apiKey.token);
// { "Authorization": "Bearer abc-123-xyz" }
```

#### `createBearerAuthHeaders(token)`
Generates headers for Bearer token authentication.

```typescript
const headers = createBearerAuthHeaders(jwtToken);
// { "Authorization": "Bearer eyJ..." }
```

### Hono Test Client

#### `createTestClient(app)`
Creates a test client for making HTTP requests to a Hono app.

```typescript
import { createTestClient } from "@platform/testkit";
import { Hono } from "hono";

const app = new Hono();
app.get("/hello", (c) => c.json({ message: "Hello" }));

const client = createTestClient(app);
const res = await client.get("/hello");
expect(res.status).toBe(200);
```

## Running Tests

### Quick Start (Recommended)

From the repo root, run all tests with automatic test database setup:

```bash
# Setup test database and run all tests across the monorepo
pnpm test
```

This will:
1. Setup the test database (create DB + run migrations)
2. Run all test suites via Turbo

### Individual Package Tests

To run tests for a specific package:

```bash
# Run API tests only
pnpm --filter @app/api test

# Run tests for a specific package
pnpm --filter @platform/db-postgres test

# Run a specific test file
pnpm --filter @app/api test -- src/routes/organizations.test.ts
```

### Manual Setup

If you prefer to run steps individually:

```bash
# 1. Setup test database (create DB + run migrations)
pnpm test:db:setup

# 2. Run tests (will use the already-setup database)
pnpm --filter @app/api test
```

### Environment Configuration

The testkit uses unique identifiers for all test data to prevent conflicts between parallel tests. Each fixture generates unique slugs, emails, and names using timestamps and random suffixes.

Example:
- User email: `test_1234567890_abc123@example.com`
- Organization slug: `test-org_1234567890_abc123`

This allows tests to run in parallel without database conflicts.

## Patterns

### Integration Test Pattern

```typescript
describe("Feature", () => {
  let testDb: TestDatabase;

  beforeAll(() => {
    testDb = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(testDb);
  });

  it("tests the feature", async () => {
    // Setup
    const setup = await Effect.runPromise(createOrganizationSetup(testDb));
    const apiKey = await Effect.runPromise(
      createApiKeyFixture(testDb.db, { organizationId: setup.organization.id })
    );

    // Execute
    const res = await app.fetch(
      new Request("/endpoint", {
        headers: createApiKeyAuthHeaders(apiKey.token),
      })
    );

    // Assert
    expect(res.status).toBe(200);
  });
});
```

### Error Testing Pattern

```typescript
it("should handle errors gracefully", async () => {
  const res = await app.fetch(
    new Request("/invalid-endpoint")
  );

  expect(res.status).toBe(404);
  const body = await res.json();
  expect(body.error).toBeDefined();
});
```

## Architecture

The testkit follows the Ports and Adapters pattern:

- **Domain packages** - Business logic and use cases
- **Platform packages** - Infrastructure adapters (testkit, db-postgres, cache-redis)
- **Apps** - HTTP handlers and routing

Tests live alongside source files (e.g., `organizations.ts` → `organizations.test.ts`) for discoverability.
