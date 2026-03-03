# @platform/testkit

Shared test helpers for hermetic tests across the Latitude monorepo.

## Testing Model

- `pnpm test` is the default monorepo test command and should run without Docker services.
- Tests should prefer in-memory/fake dependencies over real Postgres/Redis/ClickHouse/Weaviate clients.
- Real-service integration testing is opt-in via `pnpm test:integration`.

## Exports

### Postgres

- `createInMemoryPostgres()`
- `closeInMemoryPostgres()`
- `createFakePostgresPool()`
- `createTestDatabase()` / `closeTestDatabase()` (real Postgres helper for integration flows)

### Redis

- `createInMemoryRedis()` (supports `get`, `setex`, `del`, `expire`, `pipeline().incr/ttl/exec`)
- `createTestRedis()` / `closeTestRedis()` (real Redis helper for integration flows)

### ClickHouse

- `createFakeClickhouseClient()`

### Weaviate

- `createFakeWeaviateClient()`

### Fixtures and Auth

- Fixtures: `createOrganizationSetup`, `createUserFixture`, `createOrganizationFixture`, `createApiKeyFixture`, ...
- Auth helpers: `createApiKeyAuthHeaders`, `createBearerAuthHeaders`, `createAuthHeaders`
- Hono client: `createTestClient`

## Example: Hermetic API Route Test

```ts
import { Hono } from "hono"
import { beforeAll, afterAll, describe, it } from "vitest"
import {
  createInMemoryPostgres,
  closeInMemoryPostgres,
  createInMemoryRedis,
} from "@platform/testkit"
import { createDbDependenciesMiddleware } from "@app/api/src/db-deps.ts"
import { createAuthMiddleware } from "@app/api/src/middleware/auth.ts"

describe("example", () => {
  let app: Hono
  let database: Awaited<ReturnType<typeof createInMemoryPostgres>>
  const redis = createInMemoryRedis()

  beforeAll(async () => {
    database = await createInMemoryPostgres()
    app = new Hono()
    app.use("*", createDbDependenciesMiddleware({ db: database.postgresDb }))
    app.use("*", createAuthMiddleware({ redisClient: redis }))
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
    await redis.quit()
  })

  it("runs without external services", async () => {
    // ...
  })
})
```

## Integration Mode

Use real services only when a suite specifically needs provider behavior:

```bash
pnpm test:integration
```

If you run integration-style tests directly, ensure `.env.test` exists and uses `LAT_*` variables.
