import { generateId } from "@domain/shared"
import { postgresSchema } from "@platform/db-postgres"
import { createApiKeyAuthHeaders } from "@platform/testkit"
import { encrypt, hashToken } from "@repo/utils"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Hono } from "hono"
import { type TestContext, afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import {
  TEST_ENCRYPTION_KEY,
  TEST_ENCRYPTION_KEY_HEX,
  createProtectedApp,
  createTenantSetup,
} from "../test-utils/create-test-app.ts"
import {
  type InMemoryPostgres,
  closeInMemoryPostgres,
  createInMemoryPostgres,
} from "../test-utils/in-memory-postgres.ts"
import { createApiKeysRoutes } from "./api-keys.ts"

interface ApiKeysRoutesTestContext extends TestContext {
  app: Hono
  database: InMemoryPostgres
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

    const { app: root, protectedRoutes } = createProtectedApp(database)
    protectedRoutes.route("/:organizationId/api-keys", createApiKeysRoutes())
    root.route("/v1/organizations", protectedRoutes)
    app = root
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
