import { generateId } from "@domain/shared"
import { postgresSchema } from "@platform/db-postgres"
import { createApiKeyAuthHeaders } from "@platform/testkit"
import { eq } from "drizzle-orm"
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

const createProjectRecord = async (db: InMemoryPostgres["db"], organizationId: string, name: string) => {
  const id = generateId()
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id.slice(0, 6)}`

  await db.insert(postgresSchema.projects).values({
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
    const tenantA = await createTenantSetup(database.db)
    const tenantB = await createTenantSetup(database.db)

    const tenantAProject = await createProjectRecord(database.db, tenantA.organizationId, "Tenant A Project")
    const tenantBProject = await createProjectRecord(database.db, tenantB.organizationId, "Tenant B Project")

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
    const tenantA = await createTenantSetup(database.db)
    const tenantB = await createTenantSetup(database.db)
    const tenantBProject = await createProjectRecord(database.db, tenantB.organizationId, "Tenant B Project")

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenantA.organizationId}/projects/${tenantBProject.id}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenantA.apiKeyToken),
      }),
    )

    expect(response.status).toBe(204)

    const [projectAfterDelete] = await database.db
      .select({ deletedAt: postgresSchema.projects.deletedAt })
      .from(postgresSchema.projects)
      .where(eq(postgresSchema.projects.id, tenantBProject.id))
      .limit(1)

    expect(projectAfterDelete).toBeDefined()
    expect(projectAfterDelete?.deletedAt).toBeNull()
  })
})
