import { generateId } from "@domain/shared"
import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

const createProjectRecord = async (database: InMemoryPostgres, organizationId: string, name: string) => {
  const id = generateId()
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id.slice(0, 6)}`

  await database.db.insert(projects).values({
    id,
    organizationId,
    name,
    slug,
  })

  return { id, slug }
}

describe("Projects Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET /v1/projects isolates organization projects by API key", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    const tenantAProject = await createProjectRecord(database, tenantA.organizationId, "Tenant A Project")
    const tenantBProject = await createProjectRecord(database, tenantB.organizationId, "Tenant B Project")

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects`, {
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    const ids = body.projects.map((project: { id: string }) => project.id)

    expect(ids).toContain(tenantAProject.id)
    expect(ids).not.toContain(tenantBProject.id)
  })

  it<ApiTestContext>("DELETE /v1/projects/:projectSlug does not delete cross-tenant project", async ({
    app,
    database,
  }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    const tenantBProject = await createProjectRecord(database, tenantB.organizationId, "Tenant B Project")

    // Tenant A uses their own key against tenant B's project slug. Without the
    // `:organizationId` path param, cross-tenant isolation is enforced purely
    // by the API key's resolved org — the project lookup is scoped to that
    // org, and tenant B's slug does not belong to it.
    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${tenantBProject.slug}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(404)
  })
})
