import { generateId } from "@domain/shared"
import { createApiKeyAuthHeaders } from "@platform/testkit"
import type { Hono } from "hono"
import { type TestContext, afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import { TEST_ENCRYPTION_KEY_HEX, createProtectedApp, createTenantSetup } from "../test-utils/create-test-app.ts"
import {
  type InMemoryPostgres,
  closeInMemoryPostgres,
  createInMemoryPostgres,
} from "../test-utils/in-memory-postgres.ts"
import { createProjectsRoutes } from "./projects.ts"

interface ProjectsRoutesTestContext extends TestContext {
  app: Hono
  database: InMemoryPostgres
}

const createProjectRecord = async (database: InMemoryPostgres, organizationId: string, name: string) => {
  const id = generateId()
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id.slice(0, 6)}`

  await database.client.query(
    "INSERT INTO latitude.projects (id, organization_id, name, slug, created_at, updated_at, last_edited_at) VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())",
    [id, organizationId, name, slug],
  )

  return { id }
}

describe("Projects Routes Integration", () => {
  let app: Hono
  let database: InMemoryPostgres

  beforeAll(async () => {
    process.env.LAT_API_KEY_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY_HEX
    database = await createInMemoryPostgres()

    const { app: root, protectedRoutes } = createProtectedApp(database)
    protectedRoutes.route("/:organizationId/projects", createProjectsRoutes())
    root.route("/v1/organizations", protectedRoutes)
    app = root
  })

  beforeEach<ProjectsRoutesTestContext>((context) => {
    context.app = app
    context.database = database
  })

  afterAll(async () => {
    await destroyTouchBuffer()
    await closeInMemoryPostgres(database)
  })

  it<ProjectsRoutesTestContext>("GET /v1/organizations/:organizationId/projects isolates organization projects", async ({
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

  it<ProjectsRoutesTestContext>("DELETE /v1/organizations/:organizationId/projects/:id does not delete cross-tenant project", async ({
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

    expect(response.status).toBe(204)

    // Verify the project still exists and is not soft-deleted using parameterized query
    const result = await database.client.query("SELECT deleted_at FROM latitude.projects WHERE id = $1", [
      tenantBProject.id,
    ])

    expect(result.rows.length).toBe(1)
    const row = result.rows[0] as { deleted_at: string | null }
    expect(row.deleted_at).toBeNull()
  })
})
