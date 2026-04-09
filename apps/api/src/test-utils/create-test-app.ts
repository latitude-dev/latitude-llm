import type { ClickHouseClient } from "@clickhouse/client"
import type { QueuePublisherShape } from "@domain/queue"
import { generateId } from "@domain/shared"
import { OpenAPIHono } from "@hono/zod-openapi"
import type { RedisClient } from "@platform/cache-redis"
import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import { members, organizations, users } from "@platform/db-postgres/schema/better-auth"
import {
  closeInMemoryPostgres,
  createInMemoryPostgres,
  type InMemoryPostgres,
  setupTestClickHouse,
} from "@platform/testkit"
import { encrypt, hash, hexDecode } from "@repo/utils"
import { Effect } from "effect"
import type { TestContext } from "vitest"
import { afterAll, beforeAll, beforeEach } from "vitest"
import { honoErrorHandler } from "../middleware/error-handler.ts"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import { registerRoutes } from "../routes/index.ts"
import type { AppEnv } from "../types.ts"
import { createFakeRedis } from "./create-fake-redis.ts"

const TEST_ENCRYPTION_KEY_HEX = "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
export const TEST_ENCRYPTION_KEY = hexDecode(TEST_ENCRYPTION_KEY_HEX)

export interface ApiTestContext extends TestContext {
  app: OpenAPIHono<AppEnv>
  database: InMemoryPostgres
  clickhouse: ClickHouseClient
  redis: RedisClient
}

/**
 * Registers vitest `beforeAll`, `beforeEach`, and `afterAll` hooks that
 * create the full API test app with in-memory Postgres, fake Redis,
 * real route registration, and proper lifecycle management.
 *
 * Call at module scope inside a `describe` block:
 *
 * ```ts
 * describe("My Routes", () => {
 *   setupTestApi()
 *
 *   it<ApiTestContext>("works", async ({ app, database }) => { ... })
 * })
 * ```
 */
// Shared singleton so all test files reuse one PGlite instance
let sharedDb: InMemoryPostgres | undefined
let sharedDbRefCount = 0

const acquireDatabase = async (): Promise<InMemoryPostgres> => {
  if (!sharedDb) {
    sharedDb = await createInMemoryPostgres()
  }
  sharedDbRefCount++
  return sharedDb
}

const releaseDatabase = async () => {
  sharedDbRefCount--
  if (sharedDbRefCount <= 0 && sharedDb) {
    await closeInMemoryPostgres(sharedDb)
    sharedDb = undefined
    sharedDbRefCount = 0
  }
}

export const setupTestApi = () => {
  let database: InMemoryPostgres
  let app: OpenAPIHono<AppEnv>
  const clickhouse = setupTestClickHouse()
  let redis: RedisClient

  beforeAll(async () => {
    process.env.LAT_MASTER_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY_HEX
    database = await acquireDatabase()
    redis = createFakeRedis()

    app = new OpenAPIHono<AppEnv>()
    app.onError(honoErrorHandler)

    const fakePublisher: QueuePublisherShape = {
      publish: () => Effect.void,
      close: () => Effect.void,
    }

    registerRoutes(app, {
      database: database.appPostgresClient,
      adminDatabase: database.adminPostgresClient,
      clickhouse: clickhouse.client,
      redis,
      queuePublisher: fakePublisher,
      logTouchBuffer: false,
    })
  })

  beforeEach<ApiTestContext>((context) => {
    context.app = app
    context.database = database
    context.clickhouse = clickhouse.client
    context.redis = redis
  })

  afterAll(async () => {
    await destroyTouchBuffer()
    await releaseDatabase()
  })
}

interface TenantSetup {
  readonly organizationId: string
  readonly apiKeyToken: string
  readonly authApiKeyId: string
}

export const createTenantSetup = async (database: InMemoryPostgres): Promise<TenantSetup> => {
  const userId = generateId()
  const organizationId = generateId()
  const apiKeyToken = crypto.randomUUID()
  const authApiKeyId = generateId()
  const memberId = generateId()

  await database.db.insert(users).values({
    id: userId,
    email: `${userId}@example.com`,
    name: "Test User",
    emailVerified: true,
    role: "user",
  })

  await database.db.insert(organizations).values({
    id: organizationId,
    name: `Organization ${organizationId}`,
    slug: `org-${organizationId}`,
  })

  await database.db.insert(members).values({
    id: memberId,
    organizationId,
    userId,
    role: "owner",
  })

  const encryptedToken = await Effect.runPromise(encrypt(apiKeyToken, TEST_ENCRYPTION_KEY))
  const tokenHash = await Effect.runPromise(hash(apiKeyToken))

  await database.db.insert(apiKeys).values({
    id: authApiKeyId,
    organizationId,
    token: encryptedToken,
    tokenHash,
    name: "auth-key",
  })

  return { organizationId, apiKeyToken, authApiKeyId }
}
