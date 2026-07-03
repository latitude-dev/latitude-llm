import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import { organizations } from "@platform/db-postgres/schema/better-auth"
import { projects } from "@platform/db-postgres/schema/projects"
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

// `POST /v1/account/bootstrap` is mounted pre-auth, so it must work unauthenticated while `GET /v1/account` still 401s.
describe("Account routes — public bootstrap", () => {
  setupTestApi()

  it<ApiTestContext>("POST /v1/account/bootstrap succeeds unauthenticated and provisions one temporary, unclaimed organization", async ({
    app,
    database,
  }) => {
    const response = await app.fetch(
      new Request("http://localhost/v1/account/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName: "Acme Temp", projectName: "Checkout Agent" }),
      }),
    )

    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      organizationSlug: string
      projectSlug: string
      apiKey: string
      claimUrl: string
      claimEmail: string | null
      claimExpiresAt: string
    }

    expect(body.apiKey).toBeTruthy()
    expect(body.projectSlug).toBe("checkout-agent")
    expect(body.claimEmail).toBeNull()
    expect(body.claimUrl).toContain(`${process.env.LAT_WEB_URL}/claim/`)
    expect(Number.isNaN(Date.parse(body.claimExpiresAt))).toBe(false)
    expect(Date.parse(body.claimExpiresAt)).toBeGreaterThan(Date.now())

    // `apps/api` doesn't depend on drizzle-orm directly (apps go through SqlClient), so filter in JS, no `eq`.
    const allOrgs = await database.db.select().from(organizations)
    const org = allOrgs.find((o) => o.slug === body.organizationSlug)
    expect(org?.name).toBe("Acme Temp")
    expect(org?.expiresAt?.toISOString()).toBe(body.claimExpiresAt)

    const allProjects = await database.db.select().from(projects)
    const orgProjects = allProjects.filter((p) => p.organizationId === org?.id)
    expect(orgProjects).toHaveLength(1)
    expect(orgProjects[0]?.slug).toBe("checkout-agent")

    const allKeys = await database.db.select().from(apiKeys)
    const orgKeys = allKeys.filter((k) => k.organizationId === org?.id)
    expect(orgKeys).toHaveLength(1)
  })
})
