import { randomUUID } from "node:crypto"
import { generateId } from "@domain/shared"
import { type PostgresDb, postgresSchema } from "@platform/db-postgres"
import { createApiKeyAuthHeaders } from "@platform/testkit"
import { encrypt, hashToken } from "@repo/utils"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { type TestContext, afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getRedisClient } from "../clients.ts"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { honoErrorHandler } from "../middleware/error-handler.ts"
import { createOrganizationContextMiddleware } from "../middleware/organization-context.ts"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import {
  type InMemoryPostgres,
  closeInMemoryPostgres,
  createInMemoryPostgres,
} from "../test-utils/in-memory-postgres.ts"
import { createProjectsRoutes } from "./projects.ts"

interface TenantSetup {
  readonly organizationId: string
  readonly apiKeyToken: string
}

interface ProjectsRoutesTestContext extends TestContext {
  app: Hono
  database: InMemoryPostgres
}

const TEST_ENCRYPTION_KEY_HEX = "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
const TEST_ENCRYPTION_KEY = Buffer.from(TEST_ENCRYPTION_KEY_HEX, "hex")

const createApp = (db: PostgresDb): Hono => {
  const app = new Hono()
  app.onError(honoErrorHandler)
  const protectedRoutes = new Hono()

  protectedRoutes.use("*", async (c, next) => {
    c.set("db", db)
    c.set("redis", getRedisClient())
    await next()
  })

  protectedRoutes.use("*", createAuthMiddleware())
  protectedRoutes.use("/:organizationId/*", createOrganizationContextMiddleware("organizationId"))
  protectedRoutes.route("/:organizationId/projects", createProjectsRoutes())

  app.route("/v1/organizations", protectedRoutes)
  return app
}

const createTenantSetup = async (db: InMemoryPostgres["db"]): Promise<TenantSetup> => {
  const userId = generateId()
  const organizationId = generateId()
  const apiKeyToken = randomUUID()

  await db.insert(postgresSchema.user).values({
    id: userId,
    email: `${userId}@example.com`,
    name: "Test User",
    emailVerified: true,
  })

  await db.insert(postgresSchema.organization).values({
    id: organizationId,
    name: `Organization ${organizationId}`,
    slug: `org-${organizationId}`,
    creatorId: userId,
  })

  await db.insert(postgresSchema.member).values({
    id: generateId(),
    organizationId,
    userId,
    role: "owner",
  })

  await db.insert(postgresSchema.apiKeys).values({
    id: generateId(),
    organizationId,
    token: encrypt(apiKeyToken, TEST_ENCRYPTION_KEY),
    tokenHash: hashToken(apiKeyToken),
    name: "auth-key",
  })

  return {
    organizationId,
    apiKeyToken,
  }
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
    app = createApp(database.postgresDb)
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
