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

  it<ApiTestContext>("GET /v1/organizations/:organizationId/projects isolates organization projects", async ({
    app,
    database,
  }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)

    const tenantAProject = await createProjectRecord(database, tenantA.organizationId, "Tenant A Project")
    const tenantBProject = await createProjectRecord(database, tenantB.organizationId, "Tenant B Project")

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantA.organizationId}/projects`, {
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    const ids = body.projects.map((project: { id: string }) => project.id)

    expect(ids).toContain(tenantAProject.id)
    expect(ids).not.toContain(tenantBProject.id)
  })

  it<ApiTestContext>("DELETE /v1/organizations/:organizationId/projects/:projectSlug does not delete cross-tenant project", async ({
    app,
    database,
  }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    const tenantBProject = await createProjectRecord(database, tenantB.organizationId, "Tenant B Project")

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantA.organizationId}/projects/${tenantBProject.slug}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(404)
  })
})
