import { generateId } from "@domain/shared"
import { createApiKeyAuthHeaders } from "@platform/testkit"
import { encrypt, hashToken } from "@repo/utils"
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

const createApiKeyRecord = async (database: InMemoryPostgres, organizationId: string, name: string) => {
  const token = crypto.randomUUID()
  const id = generateId()
  const tokenHash = await Effect.runPromise(hashToken(token))
  const encryptedToken = await Effect.runPromise(encrypt(token, TEST_ENCRYPTION_KEY))

  await database.client.query(
    "INSERT INTO latitude.api_keys (id, organization_id, token, token_hash, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
    [id, organizationId, encryptedToken, tokenHash, name],
  )

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

    // Verify the key still exists and is not soft-deleted using parameterized query
    const result = await database.client.query("SELECT deleted_at FROM latitude.api_keys WHERE id = $1", [
      tenantBKey.id,
    ])

    expect(result.rows.length).toBe(1)
    const row = result.rows[0] as { deleted_at: string | null }
    expect(row.deleted_at).toBeNull()
  })
})
