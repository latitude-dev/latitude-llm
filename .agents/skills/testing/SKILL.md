---
name: testing
description: Writing or debugging tests, choosing unit vs integration style, Postgres/ClickHouse tests, regenerating ClickHouse test schema, or exporting test helpers from packages without pulling test code into production bundles.
---

# Testing conventions and in-memory databases

**When to use:** Writing or debugging tests, choosing unit vs integration style, Postgres/ClickHouse tests, regenerating ClickHouse test schema, or **exporting test helpers from packages** without pulling test code into production bundles.

## Package exports (test code isolation)

Test utilities (fakes, in-memory DB helpers, fixtures) must **not** be exported from a package’s main entry (`src/index.ts`).

- **Never** re-export from `./test/` or `./testing/` in the main `src/index.ts`
- To expose test helpers, add a **`/testing` subpath** in `package.json` `exports`:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/my-test-helpers.ts"
  }
}
```

- Consumers: `import { Fake } from "@platform/my-package/testing"`
- Biome `noRestrictedImports` blocks test paths in production source; tsdown fails the build if test code is resolved from prod entry points

## Conventions

- Shared default environment: Node with globals enabled (`packages/vitest-config/index.ts`)
- Write tests, mostly e2e, some unit tests when logic is complex
- **Unit tests**: domain entities/use-cases/policies with fakes
- **Contract tests**: adapter compliance against domain ports
- **Integration tests**: infra-backed tests for Postgres/ClickHouse/Redis/BullMQ/object storage
- **End-to-end tests**: ingest boundary to query boundary across organization scoping
- Keep tests deterministic and isolated
- Prefer package-local runs during iteration; run full monorepo tests before PR

## Database testing (in-memory)

**Always use in-memory databases for tests.** Do not use `vi.mock`/`vi.fn` to mock repository methods and do not require running database servers. The project provides embedded, in-process database engines that run the real SQL against the real schema:

- **ClickHouse → chdb** (`chdb` package): An in-process ClickHouse engine via `@platform/testkit`.
- **Postgres → PGlite** (`@electric-sql/pglite`): An in-process Postgres via WASM via `@platform/testkit`.

### Postgres test setup (`@platform/testkit`)

```typescript
import { setupTestPostgres } from "@platform/testkit"
import { beforeAll, describe, it } from "vitest"

const pg = setupTestPostgres()

describe("MyRepository", () => {
  it("does something", async () => {
    // pg.postgresDb is a real Drizzle instance backed by PGlite in-memory
    // pg.db is the lower-level Drizzle/PGlite instance for direct queries
  })
})
```

`setupTestPostgres()` registers vitest hooks automatically:

- **beforeAll**: creates a PGlite instance, creates the `latitude_app` role, and runs all Drizzle migrations
- **afterAll**: closes the PGlite connection

### ClickHouse test setup (`@platform/testkit`)

```typescript
import { setupTestClickHouse } from "@platform/testkit"
import { beforeAll, describe, it } from "vitest"

const ch = setupTestClickHouse()

describe("MyRepository", () => {
  let repo: ReturnType<typeof createMyRepository>

  beforeAll(() => {
    repo = createMyRepository(ch.client)
  })

  it("does something", async () => {
    // ch.client is a real ClickHouseClient backed by chdb in-memory
  })
})
```

`setupTestClickHouse()` registers vitest hooks automatically:

- **beforeAll**: creates a chdb session and loads the schema from `schema.sql`
- **beforeEach**: truncates all tables for test isolation
- **afterAll**: destroys the session and cleans up temp files

After new ClickHouse migrations, regenerate the in-memory test schema (only if the user asked you to run migration-related commands — see [database-clickhouse-weaviate](../database-clickhouse-weaviate/SKILL.md)):

```bash
pnpm --filter @platform/db-clickhouse ch:schema:dump
```

## Why not `vi.mock`?

Mocking repositories with `vi.fn()` tests the wiring, not the queries. In-memory databases catch real bugs: wrong column names, broken `argMax` aggregations, incorrect `GROUP BY` clauses, and schema mismatches. They run quickly with zero external dependencies.
