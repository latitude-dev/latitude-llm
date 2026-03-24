import { generateId } from "@domain/shared"
import { projects } from "@platform/db-postgres/schema/projects"
import {
  closeInMemoryPostgres,
  createApiKeyAuthHeaders,
  createInMemoryPostgres,
  type InMemoryPostgres,
} from "@platform/testkit"
import { eq } from "drizzle-orm"
import type { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it, type TestContext } from "vitest"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import { createProtectedApp, createTenantSetup, TEST_ENCRYPTION_KEY_HEX } from "../test-utils/create-test-app.ts"
import { createProjectsRoutes } from "./projects.ts"

interface ProjectsRoutesTestContext extends TestContext {
  app: Hono
  database: InMemoryPostgres
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

  return { id }
}

describe("Projects Routes Integration", () => {
  let app: Hono
  let database: InMemoryPostgres

  beforeAll(async () => {
    process.env.LAT_MASTER_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY_HEX
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

    expect(response.status).toBe(404)

    const rows = await database.db
      .select({ deletedAt: projects.deletedAt })
      .from(projects)
      .where(eq(projects.id, tenantBProject.id))

    expect(rows.length).toBe(1)
    expect(rows[0].deletedAt).toBeNull()
  })
})
