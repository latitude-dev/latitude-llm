import { createApiKeyAuthHeaders } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

describe("Organization Settings Routes", () => {
  setupTestApi()

  it<ApiTestContext>("GET /settings returns null settings for new organization", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/settings`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.settings).toBeNull()
  })

  it<ApiTestContext>("PATCH /settings updates keepMonitoring to false", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/settings`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keepMonitoring: false }),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.settings).toEqual({ keepMonitoring: false })
  })

  it<ApiTestContext>("PATCH /settings updates keepMonitoring to true after being set to false", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)

    await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/settings`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keepMonitoring: false }),
      }),
    )

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/settings`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keepMonitoring: true }),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.settings).toEqual({ keepMonitoring: true })
  })

  it<ApiTestContext>("GET /settings reflects persisted settings after PATCH", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)

    await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/settings`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keepMonitoring: false }),
      }),
    )

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/settings`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.settings).toEqual({ keepMonitoring: false })
  })

  it<ApiTestContext>("PATCH /settings isolates settings between organizations", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantA.organizationId}/settings`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenantA.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keepMonitoring: false }),
      }),
    )

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantB.organizationId}/settings`, {
        headers: createApiKeyAuthHeaders(tenantB.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.settings).toBeNull()
  })

  it<ApiTestContext>("PATCH /settings rejects cross-tenant access", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantB.organizationId}/settings`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenantA.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keepMonitoring: false }),
      }),
    )

    expect(response.status).toBe(403)
  })
})
