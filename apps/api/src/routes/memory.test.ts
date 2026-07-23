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

describe("Memory Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET /stores rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/memory/stores"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /stores returns an empty paginated page when no stores exist", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "aaaaaaaaaaaaaaaaaaaaaaaa")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/memory/stores`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("GET /stores rejects a malformed cursor with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "bbbbbbbbbbbbbbbbbbbbbbbb")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/memory/stores?cursor=not-a-valid-cursor`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /store returns an empty snapshot for an unknown store", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "cccccccccccccccccccccccc")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/memory/store?storeId=unknown-store`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { records: unknown[] }
    expect(body.records).toEqual([])
  })

  it<ApiTestContext>('GET /store reaches the unattributed ("") store with an empty storeId', async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "dddddddddddddddddddddddd")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/memory/store?storeId=`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { records: unknown[] }
    expect(body.records).toEqual([])
  })

  it<ApiTestContext>("GET /store/diff returns an empty diff for an unknown store", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "eeeeeeeeeeeeeeeeeeeeeeee")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/memory/store/diff?storeId=unknown-store`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { changes: unknown[]; tokensAdded: number; tokensRemoved: number }
    expect(body.changes).toEqual([])
    expect(body.tokensAdded).toBe(0)
    expect(body.tokensRemoved).toBe(0)
  })

  it<ApiTestContext>("GET /store/diff rejects an inverted date range with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "ffffffffffffffffffffffff")

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/memory/store/diff?storeId=s&from=2026-04-15T00:00:00.000Z&to=2026-04-14T00:00:00.000Z`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /store/users returns an empty items array for an unknown store", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "111111111111111111111111")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/memory/store/users?storeId=unknown-store`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it<ApiTestContext>("GET /record returns a null body and empty history for an unknown record", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "222222222222222222222222")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/memory/record?storeId=s&recordId=r`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { body: string | null; versions: unknown[] }
    expect(body.body).toBeNull()
    expect(body.versions).toEqual([])
  })

  it<ApiTestContext>("GET /record/change returns 404 for an unknown change", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "333333333333333333333333")

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/memory/record/change?storeId=s&recordId=r&spanId=${"0".repeat(16)}`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )
    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /record/reads returns an empty items array for an unknown record", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "444444444444444444444444")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/memory/record/reads?storeId=s&recordId=r`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it<ApiTestContext>("GET /record/users returns an empty items array for an unknown record", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "555555555555555555555555")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/memory/record/users?storeId=s&recordId=r`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })
})
