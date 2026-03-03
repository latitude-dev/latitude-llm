import { randomUUID } from "node:crypto"
import { generateId } from "@domain/shared-kernel"
import { type PostgresDb, postgresSchema } from "@platform/db-postgres"
import { createApiKeyAuthHeaders } from "@platform/testkit"
import { encrypt, hashToken } from "@repo/utils"
import { Hono } from "hono"
import { type TestContext, afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createDbDependenciesMiddleware } from "../db-deps.ts"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { honoErrorHandler } from "../middleware/error-handler.ts"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import {
  type InMemoryPostgres,
  closeInMemoryPostgres,
  createInMemoryPostgres,
} from "../test-utils/in-memory-postgres.ts"
import { createOrganizationsRoutes } from "./organizations.ts"

interface OrganizationSetup {
  readonly userId: string
  readonly organizationId: string
  readonly organizationName: string
  readonly apiKeyToken: string
}

interface OrganizationsTestContext extends TestContext {
  app: Hono
  database: InMemoryPostgres
}

const createApp = (db: PostgresDb): Hono => {
  const app = new Hono()
  app.onError(honoErrorHandler)
  const protectedRoutes = new Hono()

  protectedRoutes.use("*", createDbDependenciesMiddleware({ db }))
  protectedRoutes.use("*", createAuthMiddleware())
  protectedRoutes.route("/", createOrganizationsRoutes())

  app.route("/v1/organizations", protectedRoutes)
  return app
}

const TEST_ENCRYPTION_KEY = Buffer.from("75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b", "hex")

const createOrganizationSetup = async (db: InMemoryPostgres["db"]): Promise<OrganizationSetup> => {
  const userId = generateId()
  const organizationId = generateId()
  const organizationName = `Test Organization ${organizationId}`

  await db.insert(postgresSchema.user).values({
    id: userId,
    email: `${userId}@example.com`,
    name: "Test User",
    emailVerified: true,
  })

  await db.insert(postgresSchema.organization).values({
    id: organizationId,
    name: organizationName,
    slug: `org-${organizationId}`,
    creatorId: userId,
  })

  await db.insert(postgresSchema.member).values({
    id: generateId(),
    organizationId,
    userId,
    role: "owner",
  })

  const plaintextToken = randomUUID()
  await db.insert(postgresSchema.apiKeys).values({
    id: generateId(),
    organizationId,
    token: encrypt(plaintextToken, TEST_ENCRYPTION_KEY),
    tokenHash: hashToken(plaintextToken),
    name: "Test API Key",
  })

  return {
    userId,
    organizationId,
    organizationName,
    apiKeyToken: plaintextToken,
  }
}

describe("Organization Routes Integration", () => {
  let app: Hono
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
    app = createApp(database.postgresDb)
  })

  beforeEach<OrganizationsTestContext>((context) => {
    context.app = app
    context.database = database
  })

  afterAll(async () => {
    await destroyTouchBuffer()
    await closeInMemoryPostgres(database)
  })

  it<OrganizationsTestContext>("GET /v1/organizations should list organizations for an authenticated API key", async ({
    app,
    database,
  }) => {
    const setup = await createOrganizationSetup(database.db)

    const response = await app.fetch(
      new Request("http://localhost/v1/organizations", {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.organizations).toBeDefined()
    expect(Array.isArray(body.organizations)).toBe(true)
    expect(body.organizations.some((organization: { id: string }) => organization.id === setup.organizationId)).toBe(
      true,
    )
  })

  it<OrganizationsTestContext>("GET /v1/organizations/:id should return the authenticated organization", async ({
    app,
    database,
  }) => {
    const setup = await createOrganizationSetup(database.db)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${setup.organizationId}`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.id).toBe(setup.organizationId)
    expect(body.name).toBe(setup.organizationName)
  })

  it<OrganizationsTestContext>("GET /v1/organizations/:id/members should list organization members", async ({
    app,
    database,
  }) => {
    const setup = await createOrganizationSetup(database.db)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${setup.organizationId}/members`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.members).toBeDefined()
    expect(Array.isArray(body.members)).toBe(true)
    expect(body.members.length).toBeGreaterThan(0)
  })

  it<OrganizationsTestContext>("DELETE /v1/organizations/:id should delete an organization", async ({
    app,
    database,
  }) => {
    const setup = await createOrganizationSetup(database.db)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${setup.organizationId}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )

    expect(response.status).toBe(204)
  })

  it<OrganizationsTestContext>("should reject cross-tenant organization access", async ({ app, database }) => {
    const firstOrganization = await createOrganizationSetup(database.db)
    const secondOrganization = await createOrganizationSetup(database.db)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${secondOrganization.organizationId}`, {
        headers: createApiKeyAuthHeaders(firstOrganization.apiKeyToken),
      }),
    )

    expect(response.status).toBe(403)
  })
})
