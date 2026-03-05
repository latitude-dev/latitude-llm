import { generateId } from "@domain/shared"
import { type PostgresDb, postgresSchema } from "@platform/db-postgres"
import { createApiKeyAuthHeaders } from "@platform/testkit"
import { encrypt, hashToken } from "@repo/utils"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Hono } from "hono"
import { type TestContext, afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getRedisClient } from "../clients.ts"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { honoErrorHandler } from "../middleware/error-handler.ts"
import { createOrganizationContextMiddleware } from "../middleware/organization-context.ts"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import {
  type InMemoryPostgres,
  closeInMemoryPostgres,
  createInMemoryPostgres,
} from "../test-utils/in-memory-postgres.ts"
import { createApiKeysRoutes } from "./api-keys.ts"

interface TenantSetup {
  readonly organizationId: string
  readonly apiKeyToken: string
  readonly authApiKeyId: string
}

interface ApiKeysRoutesTestContext extends TestContext {
  app: Hono
  database: InMemoryPostgres
}

const TEST_ENCRYPTION_KEY_HEX = "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
const TEST_ENCRYPTION_KEY = Buffer.from(TEST_ENCRYPTION_KEY_HEX, "hex")

const createApp = (db: PostgresDb): Hono => {
  const app = new Hono()
  app.onError(honoErrorHandler)
  const protectedRoutes = new Hono()

  protectedRoutes.use("*", async (c, next) => {
    c.set("db", db)
    c.set("redis", getRedisClient())
    await next()
  })

  protectedRoutes.use("*", createAuthMiddleware())
  protectedRoutes.use("/:organizationId/*", createOrganizationContextMiddleware())
  protectedRoutes.route("/:organizationId/api-keys", createApiKeysRoutes())

  app.route("/v1/organizations", protectedRoutes)
  return app
}

const createTenantSetup = async (db: InMemoryPostgres["db"]): Promise<TenantSetup> => {
  const userId = generateId()
  const organizationId = generateId()
  const apiKeyToken = crypto.randomUUID()
  const authApiKeyId = generateId()

  await db.insert(postgresSchema.user).values({
    id: userId,
    email: `${userId}@example.com`,
    name: "Test User",
    emailVerified: true,
  })

  await db.insert(postgresSchema.organization).values({
    id: organizationId,
    name: `Organization ${organizationId}`,
    slug: `org-${organizationId}`,
    creatorId: userId,
  })

  await db.insert(postgresSchema.member).values({
    id: generateId(),
    organizationId,
    userId,
    role: "owner",
  })

  await db.insert(postgresSchema.apiKeys).values({
    id: authApiKeyId,
    organizationId,
    token: await Effect.runPromise(encrypt(apiKeyToken, TEST_ENCRYPTION_KEY)),
    tokenHash: await Effect.runPromise(hashToken(apiKeyToken)),
    name: "auth-key",
  })

  return {
    organizationId,
    apiKeyToken,
    authApiKeyId,
  }
}

const createApiKeyRecord = async (db: InMemoryPostgres["db"], organizationId: string, name: string) => {
  const token = crypto.randomUUID()
  const id = generateId()
  const tokenHash = await Effect.runPromise(hashToken(token))

  await db.insert(postgresSchema.apiKeys).values({
    id,
    organizationId,
    token: await Effect.runPromise(encrypt(token, TEST_ENCRYPTION_KEY)),
    tokenHash,
    name,
  })

  return { id }
}

describe("API Keys Routes Integration", () => {
  let app: Hono
  let database: InMemoryPostgres

  beforeAll(async () => {
    process.env.LAT_API_KEY_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY_HEX
    database = await createInMemoryPostgres()
    app = createApp(database.postgresDb)
  })

  beforeEach<ApiKeysRoutesTestContext>((context) => {
    context.app = app
    context.database = database
  })

  afterAll(async () => {
    await destroyTouchBuffer()
    await closeInMemoryPostgres(database)
  })

  it<ApiKeysRoutesTestContext>("GET /v1/organizations/:organizationId/api-keys isolates organization API keys", async ({
    app,
    database,
  }) => {
    const tenantA = await createTenantSetup(database.db)
    const tenantB = await createTenantSetup(database.db)

    const tenantAKey = await createApiKeyRecord(database.db, tenantA.organizationId, "tenant-a-key")
    const tenantBKey = await createApiKeyRecord(database.db, tenantB.organizationId, "tenant-b-key")

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantA.organizationId}/api-keys`, {
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    const ids = body.apiKeys.map((apiKey: { id: string }) => apiKey.id)

    expect(ids).toContain(tenantA.authApiKeyId)
    expect(ids).toContain(tenantAKey.id)
    expect(ids).not.toContain(tenantB.authApiKeyId)
    expect(ids).not.toContain(tenantBKey.id)
  })

  it<ApiKeysRoutesTestContext>("DELETE /v1/organizations/:organizationId/api-keys/:id cannot revoke cross-tenant keys", async ({
    app,
    database,
  }) => {
    const tenantA = await createTenantSetup(database.db)
    const tenantB = await createTenantSetup(database.db)
    const tenantBKey = await createApiKeyRecord(database.db, tenantB.organizationId, "tenant-b-key")

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantA.organizationId}/api-keys/${tenantBKey.id}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(404)

    const [stillActive] = await database.db
      .select({ deletedAt: postgresSchema.apiKeys.deletedAt })
      .from(postgresSchema.apiKeys)
      .where(eq(postgresSchema.apiKeys.id, tenantBKey.id))
      .limit(1)

    expect(stillActive).toBeDefined()
    expect(stillActive?.deletedAt).toBeNull()
  })
})
