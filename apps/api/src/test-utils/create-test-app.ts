import type { ClickHouseClient } from "@clickhouse/client"
import type { QueuePublisherShape } from "@domain/queue"
import { generateId } from "@domain/shared"
import { OpenAPIHono } from "@hono/zod-openapi"
import type { RedisClient } from "@platform/cache-redis"
import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import {
  members,
  oauthAccessTokens,
  oauthApplications,
  organizations,
  users,
} from "@platform/db-postgres/schema/better-auth"
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
import { resetEndpointRegistry } from "../mcp/registry.ts"
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

    // The MCP endpoint registry is module-global. Multiple test files mounted in
    // the same vitest worker would otherwise accumulate entries across
    // `registerRoutes` calls — reset before each test app boot.
    resetEndpointRegistry()

    app = new OpenAPIHono<AppEnv>()
    app.onError(honoErrorHandler)

    const fakePublisher: QueuePublisherShape = {
      publish: () => Effect.void,
      scheduleRepeatable: () => Effect.void,
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
  readonly userId: string
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

  return { userId, organizationId, apiKeyToken, authApiKeyId }
}

interface OAuthTenantSetup extends TenantSetup {
  /** Bearer token to use as `Authorization: Bearer <oauthAccessToken>` on the test client. */
  readonly oauthAccessToken: string
  /** Stable id of the seeded `oauth_applications` row. */
  readonly oauthClientId: string
}

/**
 * Extends {@link createTenantSetup} with an OAuth application + access token
 * bound to the same org and user. Use this when a route requires OAuth auth
 * (mutations on `/v1/members`, anything that needs `c.var.auth.method` ===
 * `"oauth"`).
 *
 * The seeded token is a fresh random string; the API's `validateOAuthAccessToken`
 * looks it up directly in the shared `oauthAccessTokens` table, so any
 * 36-character-ish value works for tests.
 */
export const createOAuthTenantSetup = async (database: InMemoryPostgres): Promise<OAuthTenantSetup> => {
  const tenant = await createTenantSetup(database)

  const clientId = `lct_${generateId()}`
  const oauthAccessToken = `loa_${crypto.randomUUID()}`
  const oneHour = 60 * 60 * 1000

  await database.db.insert(oauthApplications).values({
    id: generateId(),
    name: "Test MCP Client",
    clientId,
    userId: tenant.userId,
    organizationId: tenant.organizationId,
    disabled: false,
  })

  await database.db.insert(oauthAccessTokens).values({
    id: generateId(),
    accessToken: oauthAccessToken,
    clientId,
    userId: tenant.userId,
    accessTokenExpiresAt: new Date(Date.now() + oneHour),
    scopes: "openid profile email",
  })

  return { ...tenant, oauthAccessToken, oauthClientId: clientId }
}

/**
 * Builds `Authorization: Bearer <token>` headers for an OAuth-authenticated
 * test request. Pair with {@link createOAuthTenantSetup}.
 */
export const createOAuthAuthHeaders = (oauthAccessToken: string): Record<string, string> => ({
  Authorization: `Bearer ${oauthAccessToken}`,
})
