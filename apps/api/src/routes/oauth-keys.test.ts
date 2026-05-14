import { eq } from "@platform/db-postgres"
import { oauthAccessTokens, oauthApplications } from "@platform/db-postgres/schema/better-auth"
import { createApiKeyAuthHeaders } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createOAuthAuthHeaders,
  createOAuthTenantSetup,
  setupTestApi,
} from "../test-utils/create-test-app.ts"

interface OAuthKeyRow {
  readonly id: string
  readonly clientId: string
  readonly clientName: string | null
  readonly userId: string
  readonly userEmail: string
  readonly disabled: boolean
}

interface ListResponse {
  readonly oauthKeys: ReadonlyArray<OAuthKeyRow>
}

const listOAuthKeysJson = async (
  app: ApiTestContext["app"],
  headers: Record<string, string>,
): Promise<ListResponse> => {
  const res = await app.fetch(new Request("http://localhost/v1/oauth-keys", { headers }))
  expect(res.status).toBe(200)
  return (await res.json()) as ListResponse
}

describe("OAuth keys routes — list", () => {
  setupTestApi()

  it<ApiTestContext>("GET /v1/oauth-keys returns this org's keys with metadata only (no tokens)", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    const body = await listOAuthKeysJson(app, createOAuthAuthHeaders(tenant.oauthAccessToken))

    expect(body.oauthKeys).toHaveLength(1)
    const [row] = body.oauthKeys
    expect(row?.clientId).toBe(tenant.oauthClientId)
    expect(row?.userId).toBe(tenant.userId)
    expect(row?.disabled).toBe(false)
    // Crucial guarantee: no token-shaped field on the response.
    const keys = Object.keys(row as object)
    expect(keys).not.toContain("accessToken")
    expect(keys).not.toContain("access_token")
    expect(keys).not.toContain("refreshToken")
    expect(keys).not.toContain("token")
  })

  it<ApiTestContext>("GET /v1/oauth-keys isolates by organization", async ({ app, database }) => {
    const tenantA = await createOAuthTenantSetup(database)
    const tenantB = await createOAuthTenantSetup(database)

    const bodyA = await listOAuthKeysJson(app, createOAuthAuthHeaders(tenantA.oauthAccessToken))
    expect(bodyA.oauthKeys.map((k) => k.clientId)).toEqual([tenantA.oauthClientId])

    const bodyB = await listOAuthKeysJson(app, createOAuthAuthHeaders(tenantB.oauthAccessToken))
    expect(bodyB.oauthKeys.map((k) => k.clientId)).toEqual([tenantB.oauthClientId])
  })

  it<ApiTestContext>("GET /v1/oauth-keys works for API-key callers too (read-only)", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const body = await listOAuthKeysJson(app, createApiKeyAuthHeaders(tenant.apiKeyToken))
    expect(body.oauthKeys.map((k) => k.clientId)).toContain(tenant.oauthClientId)
  })
})

describe("OAuth keys routes — get", () => {
  setupTestApi()

  it<ApiTestContext>("GET /v1/oauth-keys/{id} returns the row matching the composite id", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const compositeId = `${tenant.oauthClientId}:${tenant.userId}`

    const res = await app.fetch(
      new Request(`http://localhost/v1/oauth-keys/${compositeId}`, {
        headers: createOAuthAuthHeaders(tenant.oauthAccessToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as OAuthKeyRow
    expect(body.id).toBe(compositeId)
    expect(body.clientId).toBe(tenant.oauthClientId)
    expect(body.userId).toBe(tenant.userId)
  })

  it<ApiTestContext>("GET /v1/oauth-keys/{id} returns 404 for malformed ids", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)

    const res = await app.fetch(
      new Request("http://localhost/v1/oauth-keys/not-a-composite", {
        headers: createOAuthAuthHeaders(tenant.oauthAccessToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /v1/oauth-keys/{id} returns 404 for cross-tenant ids", async ({ app, database }) => {
    const tenantA = await createOAuthTenantSetup(database)
    const tenantB = await createOAuthTenantSetup(database)
    const otherCompositeId = `${tenantB.oauthClientId}:${tenantB.userId}`

    const res = await app.fetch(
      new Request(`http://localhost/v1/oauth-keys/${otherCompositeId}`, {
        headers: createOAuthAuthHeaders(tenantA.oauthAccessToken),
      }),
    )

    expect(res.status).toBe(404)
  })
})

describe("OAuth keys routes — revoke", () => {
  setupTestApi()

  it<ApiTestContext>("DELETE /v1/oauth-keys/{id} drops the access tokens for the pair", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    // Pair has one token; sanity-check it's there before revoke.
    const before = await database.db
      .select({ id: oauthAccessTokens.id })
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.clientId, tenant.oauthClientId))
    expect(before).toHaveLength(1)

    const apiKeyHeaders = createApiKeyAuthHeaders(tenant.apiKeyToken)
    const res = await app.fetch(
      new Request(`http://localhost/v1/oauth-keys/${tenant.oauthClientId}:${tenant.userId}`, {
        method: "DELETE",
        headers: apiKeyHeaders,
      }),
    )
    expect(res.status).toBe(204)

    const after = await database.db
      .select({ id: oauthAccessTokens.id })
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.clientId, tenant.oauthClientId))
    expect(after).toHaveLength(0)

    // Application gets disabled because no tokens remain for that client.
    const apps = await database.db
      .select({ disabled: oauthApplications.disabled })
      .from(oauthApplications)
      .where(eq(oauthApplications.clientId, tenant.oauthClientId))
    expect(apps[0]?.disabled).toBe(true)
  })

  it<ApiTestContext>("DELETE /v1/oauth-keys/{id} is idempotent — second call still returns 204", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    const compositeId = `${tenant.oauthClientId}:${tenant.userId}`
    const headers = createApiKeyAuthHeaders(tenant.apiKeyToken)

    const first = await app.fetch(
      new Request(`http://localhost/v1/oauth-keys/${compositeId}`, { method: "DELETE", headers }),
    )
    expect(first.status).toBe(204)

    const second = await app.fetch(
      new Request(`http://localhost/v1/oauth-keys/${compositeId}`, { method: "DELETE", headers }),
    )
    // After the first revoke the application is disabled; the second revoke
    // still finds the row in this org, so it 204s rather than 404s.
    expect(second.status).toBe(204)
  })

  it<ApiTestContext>("DELETE /v1/oauth-keys/{id} can't reach a cross-tenant pair (404)", async ({ app, database }) => {
    const tenantA = await createOAuthTenantSetup(database)
    const tenantB = await createOAuthTenantSetup(database)
    const otherCompositeId = `${tenantB.oauthClientId}:${tenantB.userId}`

    const res = await app.fetch(
      new Request(`http://localhost/v1/oauth-keys/${otherCompositeId}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )
    expect(res.status).toBe(404)

    // Tenant B's tokens are untouched.
    const tokens = await database.db
      .select({ id: oauthAccessTokens.id })
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.clientId, tenantB.oauthClientId))
    expect(tokens).toHaveLength(1)
  })
})
