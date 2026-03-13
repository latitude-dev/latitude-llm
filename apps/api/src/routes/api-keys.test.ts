import { generateId } from "@domain/shared"
import { postgresSchema } from "@platform/db-postgres"
import {
  closeInMemoryPostgres,
  createApiKeyAuthHeaders,
  createInMemoryPostgres,
  type InMemoryPostgres,
} from "@platform/testkit"
import { encrypt, hashToken } from "@repo/utils"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it, type TestContext } from "vitest"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import {
  createProtectedApp,
  createTenantSetup,
  TEST_ENCRYPTION_KEY,
  TEST_ENCRYPTION_KEY_HEX,
} from "../test-utils/create-test-app.ts"
import { createApiKeysRoutes } from "./api-keys.ts"

interface ApiKeysRoutesTestContext extends TestContext {
  app: Hono
  database: InMemoryPostgres
}

const createApiKeyRecord = async (database: InMemoryPostgres, organizationId: string, name: string) => {
  const token = crypto.randomUUID()
  const id = generateId()
  const tokenHash = await Effect.runPromise(hashToken(token))
  const encryptedToken = await Effect.runPromise(encrypt(token, TEST_ENCRYPTION_KEY))

  await database.db.insert(postgresSchema.apiKeys).values({
    id,
    organizationId,
    token: encryptedToken,
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
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    const tenantAKey = await createApiKeyRecord(database, tenantA.organizationId, "tenant-a-key")
    const tenantBKey = await createApiKeyRecord(database, tenantB.organizationId, "tenant-b-key")

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
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    const tenantBKey = await createApiKeyRecord(database, tenantB.organizationId, "tenant-b-key")

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantA.organizationId}/api-keys/${tenantBKey.id}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(404)

    const rows = await database.db
      .select({ deletedAt: postgresSchema.apiKeys.deletedAt })
      .from(postgresSchema.apiKeys)
      .where(eq(postgresSchema.apiKeys.id, tenantBKey.id))

    expect(rows.length).toBe(1)
    expect(rows[0].deletedAt).toBeNull()
  })
})
