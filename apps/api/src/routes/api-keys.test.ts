import { generateId } from "@domain/shared"
import { and, eq } from "@platform/db-postgres"
import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import { members } from "@platform/db-postgres/schema/better-auth"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { encrypt, hash } from "@repo/utils"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createOAuthAuthHeaders,
  createOAuthTenantSetup,
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

const demoteTenantUserToMember = async (
  database: InMemoryPostgres,
  tenant: { userId: string; organizationId: string },
) => {
  await database.db
    .update(members)
    .set({ role: "member" })
    .where(and(eq(members.organizationId, tenant.organizationId), eq(members.userId, tenant.userId)))
}

describe("API Keys Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET /v1/api-keys returns only the caller's org's keys", async ({ app, database }) => {
    const tenantA = await createOAuthTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    const tenantAKey = await createApiKeyRecord(database, tenantA.organizationId, "tenant-a-key")
    const tenantBKey = await createApiKeyRecord(database, tenantB.organizationId, "tenant-b-key")

    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys`, {
        headers: createOAuthAuthHeaders(tenantA.oauthAccessToken),
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
    const tenant = await createOAuthTenantSetup(database)

    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys`, {
        method: "POST",
        headers: {
          ...createOAuthAuthHeaders(tenant.oauthAccessToken),
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

  it<ApiTestContext>("GET /v1/api-keys list response includes a masked token preview", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)

    const response = await app.fetch(
      new Request("http://localhost/v1/api-keys", { headers: createOAuthAuthHeaders(tenant.oauthAccessToken) }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      apiKeys: ReadonlyArray<{ id: string; token: string }>
    }
    const authKey = body.apiKeys.find((k) => k.id === tenant.authApiKeyId)
    expect(authKey).toBeDefined()
    expect(authKey?.token).toMatch(/^.{4}\*+.{4}$/)
    // The full token must NOT appear in the list response.
    expect(authKey?.token).not.toBe(tenant.apiKeyToken)
  })

  it<ApiTestContext>("GET /v1/api-keys/:apiKeyId returns a masked token preview", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)

    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys/${tenant.authApiKeyId}`, {
        headers: createOAuthAuthHeaders(tenant.oauthAccessToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { id: string; token: string }
    expect(body.id).toBe(tenant.authApiKeyId)
    expect(body.token).toMatch(/^.{4}\*+.{4}$/)
    expect(body.token).not.toBe(tenant.apiKeyToken)
  })

  it<ApiTestContext>("GET /v1/api-keys/:apiKeyId is org-scoped (404 across tenants)", async ({ app, database }) => {
    const tenantA = await createOAuthTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys/${tenantB.authApiKeyId}`, {
        headers: createOAuthAuthHeaders(tenantA.oauthAccessToken),
      }),
    )

    expect(response.status).toBe(404)
  })

  it<ApiTestContext>("PATCH /v1/api-keys/:apiKeyId renames the key", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)

    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys/${tenant.authApiKeyId}`, {
        method: "PATCH",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "renamed" }),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { id: string; name: string; token: string }
    expect(body.id).toBe(tenant.authApiKeyId)
    expect(body.name).toBe("renamed")
    expect(body.token).toMatch(/^.{4}\*+.{4}$/)
    expect(body.token).not.toBe(tenant.apiKeyToken)
  })

  it<ApiTestContext>("PATCH /v1/api-keys/:apiKeyId is org-scoped (404 across tenants)", async ({ app, database }) => {
    const tenantA = await createOAuthTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys/${tenantB.authApiKeyId}`, {
        method: "PATCH",
        headers: { ...createOAuthAuthHeaders(tenantA.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "should-not-apply" }),
      }),
    )

    expect(response.status).toBe(404)
  })

  it<ApiTestContext>("DELETE /v1/api-keys/:apiKeyId cannot revoke cross-tenant keys", async ({ app, database }) => {
    const tenantA = await createOAuthTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    const tenantBKey = await createApiKeyRecord(database, tenantB.organizationId, "tenant-b-key")

    const response = await app.fetch(
      new Request(`http://localhost/v1/api-keys/${tenantBKey.id}`, {
        method: "DELETE",
        headers: createOAuthAuthHeaders(tenantA.oauthAccessToken),
      }),
    )

    expect(response.status).toBe(404)
  })

  it<ApiTestContext>("rejects API-key bearer auth for key management", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)

    const response = await app.fetch(
      new Request("http://localhost/v1/api-keys", { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }),
    )

    expect(response.status).toBe(403)
  })

  it<ApiTestContext>("rejects non-admin OAuth callers for key management", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    await demoteTenantUserToMember(database, tenant)

    const response = await app.fetch(
      new Request("http://localhost/v1/api-keys", { headers: createOAuthAuthHeaders(tenant.oauthAccessToken) }),
    )

    expect(response.status).toBe(403)
  })
})
