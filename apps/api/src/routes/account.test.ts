import { createApiKeyAuthHeaders } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

describe("Account routes", () => {
  setupTestApi()

  it<ApiTestContext>("returns 401 without a bearer token", async ({ app }) => {
    const response = await app.fetch(new Request("http://localhost/v1/account"))
    expect(response.status).toBe(401)
  })

  it<ApiTestContext>("API-key callers get `user: null` and `role: null` (API keys aren't user-scoped)", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)

    const response = await app.fetch(
      new Request("http://localhost/v1/account", { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      user: null | { id: string }
      organization: { id: string; name: string; slug: string }
      role: null | string
    }
    expect(body.user).toBeNull()
    expect(body.role).toBeNull()
    expect(body.organization.id).toBe(tenant.organizationId)
    expect(body.organization.slug).toBe(`org-${tenant.organizationId}`)
  })

  it<ApiTestContext>("scopes the response to the caller's org (cross-tenant isolation)", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    const response = await app.fetch(
      new Request("http://localhost/v1/account", { headers: createApiKeyAuthHeaders(tenantA.apiKeyToken) }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { organization: { id: string } }
    expect(body.organization.id).toBe(tenantA.organizationId)
    expect(body.organization.id).not.toBe(tenantB.organizationId)
  })
})
