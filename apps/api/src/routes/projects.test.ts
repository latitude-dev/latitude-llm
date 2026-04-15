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

  return { id }
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

  it<ApiTestContext>("DELETE /v1/organizations/:organizationId/projects/:id does not delete cross-tenant project", async ({
    app,
    database,
  }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    const tenantBProject = await createProjectRecord(database, tenantB.organizationId, "Tenant B Project")

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantA.organizationId}/projects/${tenantBProject.id}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(404)
  })

  it<ApiTestContext>("GET /projects returns settings in project response", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    await createProjectRecord(database, tenant.organizationId, "Settings Project")

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.projects[0]).toHaveProperty("settings")
  })

  it<ApiTestContext>("PATCH /projects/:id updates keepMonitoring setting", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "Monitor Project")

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ settings: { keepMonitoring: false } }),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.settings).toEqual({ keepMonitoring: false })
  })

  it<ApiTestContext>("GET /projects/:id returns persisted settings after PATCH", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "Persisted Settings")

    await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ settings: { keepMonitoring: false } }),
      }),
    )

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${project.id}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.settings).toEqual({ keepMonitoring: false })
  })

  it<ApiTestContext>("PATCH /projects/:id updates name without affecting settings", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "Unchanged Settings")

    await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ settings: { keepMonitoring: false } }),
      }),
    )

    const renameResponse = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Renamed Project" }),
      }),
    )

    expect(renameResponse.status).toBe(200)
    const body = await renameResponse.json()
    expect(body.name).toBe("Renamed Project")
    expect(body.settings).toEqual({ keepMonitoring: false })
  })
})
