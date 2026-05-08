import { generateId } from "@domain/shared"
import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { encrypt, hash } from "@repo/utils"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createTenantSetup,
  setupTestApi,
  TEST_ENCRYPTION_KEY,
} from "../test-utils/create-test-app.ts"

const createApiKeyRecord = async (database: InMemoryPostgres, organizationId: string, name: string) => {
  const token = crypto.randomUUID()
  const id = generateId()
  const tokenHash = await Effect.runPromise(hash(token))
  const encryptedToken = await Effect.runPromise(encrypt(token, TEST_ENCRYPTION_KEY))

  await database.db.insert(apiKeys).values({
    id,
    organizationId,
    token: encryptedToken,
    tokenHash,
    name,
  })

  return { id }
}

describe("API Keys Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET /v1/api-keys returns only the caller's org's keys", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    const tenantAKey = await createApiKeyRecord(database, tenantA.organizationId, "tenant-a-key")
    const tenantBKey = await createApiKeyRecord(database, tenantB.organizationId, "tenant-b-key")

    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys`, {
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

  it<ApiTestContext>("POST /v1/api-keys creates an API key in the caller's org", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)

    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "new-key-from-post" }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.name).toBe("new-key-from-post")
    expect(typeof body.token).toBe("string")
    expect(body.token.length).toBeGreaterThan(0)
  })

  it<ApiTestContext>("DELETE /v1/api-keys/:id cannot revoke cross-tenant keys", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    const tenantBKey = await createApiKeyRecord(database, tenantB.organizationId, "tenant-b-key")

    // Tenant A's key targeting tenant B's key id: without the `:organizationId`
    // path param, cross-tenant isolation comes entirely from the API key's
    // resolved org scoping the repo lookup. The key belongs to tenant B's org,
    // so tenant A's repo query does not find it.
    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys/${tenantBKey.id}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(404)
  })
})
