import { generateId } from "@domain/shared"
import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

interface ProjectRow {
  readonly id: string
  readonly organizationId: string
  readonly name: string
  readonly slug: string
  readonly settings: { keepMonitoring?: boolean } | null
  readonly firstTraceAt: string | null
  readonly deletedAt: string | null
  readonly lastEditedAt: string
  readonly createdAt: string
  readonly updatedAt: string
}

interface PaginatedProjects {
  readonly items: ReadonlyArray<ProjectRow>
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

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
    const body = (await response.json()) as PaginatedProjects
    const ids = body.items.map((project) => project.id)

    expect(ids).toContain(tenantAProject.id)
    expect(ids).not.toContain(tenantBProject.id)
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("GET /v1/projects returns the full project shape including new fields", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    await createProjectRecord(database, tenant.organizationId, "Shape Project")

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as PaginatedProjects
    const project = body.items[0]
    expect(project).toBeDefined()
    expect(project).toHaveProperty("settings")
    expect(project).toHaveProperty("firstTraceAt")
    expect(project).toHaveProperty("lastEditedAt")
  })

  it<ApiTestContext>("GET /v1/projects excludes soft-deleted projects", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const live = await createProjectRecord(database, tenant.organizationId, "Live")

    const deleteResponse = await app.fetch(
      new Request(`http://localhost/v1/projects/${live.slug}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(deleteResponse.status).toBe(204)

    const listResponse = await app.fetch(
      new Request(`http://localhost/v1/projects`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    const body = (await listResponse.json()) as PaginatedProjects
    expect(body.items.find((p) => p.id === live.id)).toBeUndefined()
  })

  it<ApiTestContext>("PATCH /v1/projects/:projectSlug updates settings and regenerates slug on rename", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "Old Name")

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${project.slug}`, {
        method: "PATCH",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Completely Different", settings: { keepMonitoring: true } }),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as ProjectRow
    expect(body.name).toBe("Completely Different")
    expect(body.slug).not.toBe(project.slug)
    expect(body.slug).toContain("completely-different")
    expect(body.settings).toEqual({ keepMonitoring: true })
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
