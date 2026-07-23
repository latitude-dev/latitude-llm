import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

const createProjectRecord = async (
  database: InMemoryPostgres,
  organizationId: string,
  projectId: string,
): Promise<string> => {
  const slug = `project-${projectId.slice(0, 8)}`
  await database.db.insert(projects).values({
    id: projectId,
    organizationId,
    name: `Project ${projectId}`,
    slug,
  })
  return slug
}

const get = (app: ApiTestContext["app"], path: string, token?: string) =>
  app.fetch(
    new Request(`http://localhost/v1/projects/${path}`, {
      method: "GET",
      headers: token ? createApiKeyAuthHeaders(token) : {},
    }),
  )

describe("Users Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET / rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await get(app, "foo/users")
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /{userId} rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await get(app, "foo/users/user-123")
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET / returns an empty page when no users are ingested", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "aaaaaaaaaaaaaaaaaaaaaaaa")

    const res = await get(app, `${slug}/users`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: unknown[]
      totalCount: number
      hasMore: boolean
      costRollup: { sum: number; avg: number; median: number }
    }
    expect(body.items).toEqual([])
    expect(body.totalCount).toBe(0)
    expect(body.hasMore).toBe(false)
    expect(body.costRollup).toEqual({ sum: 0, avg: 0, median: 0 })
  })

  it<ApiTestContext>("GET / rejects an inverted range with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "bbbbbbbbbbbbbbbbbbbbbbbb")

    const res = await get(
      app,
      `${slug}/users?fromIso=2024-02-01T00:00:00.000Z&toIso=2024-01-01T00:00:00.000Z`,
      tenant.apiKeyToken,
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET / rejects an invalid sortBy with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "cccccccccccccccccccccccc")

    const res = await get(app, `${slug}/users?sortBy=bogus`, tenant.apiKeyToken)
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /overview resolves to the overview route, not the profile route", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "dddddddddddddddddddddddd")

    const res = await get(app, `${slug}/users/overview`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { uniqueUsers?: number; histogram?: unknown[]; userId?: unknown }
    expect(body.uniqueUsers).toBe(0)
    expect(Array.isArray(body.histogram)).toBe(true)
    // The profile shape would carry a `userId` key — proves routing order.
    expect(body).not.toHaveProperty("userId")
  })

  it<ApiTestContext>("GET /{userId} returns 404 for a never-seen user", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "eeeeeeeeeeeeeeeeeeeeeeee")

    const res = await get(app, `${slug}/users/never-seen-user`, tenant.apiKeyToken)
    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{userId}/activity returns an empty histogram for a never-seen user", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "ffffffffffffffffffffffff")

    const res = await get(app, `${slug}/users/never-seen-user/activity`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { buckets: { count: number; errorCount: number }[]; bucketSeconds: number }
    expect(Array.isArray(body.buckets)).toBe(true)
    expect(body.buckets.every((b) => b.count === 0 && b.errorCount === 0)).toBe(true)
  })

  it<ApiTestContext>("GET /{userId}/usage rejects a missing dimension with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "999999999999999999999999")

    const res = await get(app, `${slug}/users/user-123/usage`, tenant.apiKeyToken)
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{userId}/usage rejects an invalid dimension with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "888888888888888888888888")

    const res = await get(app, `${slug}/users/user-123/usage?dimension=bogus`, tenant.apiKeyToken)
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{userId}/signals returns an empty list for a never-seen user", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "777777777777777777777777")

    const res = await get(app, `${slug}/users/never-seen-user/signals`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it<ApiTestContext>("GET /{userId}/behaviours returns an empty list for a never-seen user", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "666666666666666666666666")

    const res = await get(app, `${slug}/users/never-seen-user/behaviours`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it<ApiTestContext>("GET /{userId}/memory returns an empty list for a never-seen user", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "111111111111111111111111")

    const res = await get(app, `${slug}/users/never-seen-user/memory`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it<ApiTestContext>("GET /{userId}/memory rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await get(app, "foo/users/some-user/memory")
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET / returns 404 for an unknown project slug", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const res = await get(app, "does-not-exist/users", tenant.apiKeyToken)
    expect(res.status).toBe(404)
  })
})
