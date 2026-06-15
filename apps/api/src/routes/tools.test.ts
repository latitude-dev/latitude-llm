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

describe("Tools Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET / rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await get(app, "foo/tools")
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /{toolName} rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await get(app, "foo/tools/lookup_order")
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET / returns empty analytics when no tools are ingested", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "aaaaaaaaaaaaaaaaaaaaaaaa")

    const res = await get(app, `${slug}/tools`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      totals: { traces: number; sessions: number; tracesWithToolCalls: number; sessionsWithToolCalls: number }
      tools: unknown[]
    }
    expect(body.tools).toEqual([])
    expect(body.totals.traces).toBe(0)
    expect(body.totals.sessionsWithToolCalls).toBe(0)
  })

  it<ApiTestContext>("GET / rejects an inverted range with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "bbbbbbbbbbbbbbbbbbbbbbbb")

    const res = await get(
      app,
      `${slug}/tools?fromIso=2024-02-01T00:00:00.000Z&toIso=2024-01-01T00:00:00.000Z`,
      tenant.apiKeyToken,
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /histogram resolves to the histogram route, not the tool-detail route", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "cccccccccccccccccccccccc")

    const res = await get(app, `${slug}/tools/histogram`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items?: unknown[]; definition?: unknown }
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items).toEqual([])
    // The tool-detail shape would have a `definition` key — proves routing order.
    expect(body).not.toHaveProperty("definition")
  })

  it<ApiTestContext>("GET /{toolName} returns null detail for a never-seen tool", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "dddddddddddddddddddddddd")

    const res = await get(app, `${slug}/tools/never_seen_tool`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { definition: unknown; usage: unknown; errorsUsage: unknown }
    expect(body.definition).toBeNull()
    expect(body.usage).toBeNull()
    expect(body.errorsUsage).toBeNull()
  })

  it<ApiTestContext>("GET /{toolName}/calls returns an empty page", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "eeeeeeeeeeeeeeeeeeeeeeee")

    const res = await get(app, `${slug}/tools/lookup_order/calls`, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("GET /{toolName}/calls rejects a malformed cursor with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "ffffffffffffffffffffffff")

    const res = await get(app, `${slug}/tools/lookup_order/calls?cursor=not-a-cursor`, tenant.apiKeyToken)
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{toolName}/context rejects a missing dimension with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "999999999999999999999999")

    const res = await get(app, `${slug}/tools/lookup_order/context`, tenant.apiKeyToken)
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{toolName}/context rejects an invalid dimension with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "888888888888888888888888")

    const res = await get(app, `${slug}/tools/lookup_order/context?dimension=bogus`, tenant.apiKeyToken)
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{toolName}/parameters rejects out-of-range topKeys with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "777777777777777777777777")

    const res = await get(app, `${slug}/tools/lookup_order/parameters?topKeys=99`, tenant.apiKeyToken)
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET / returns 404 for an unknown project slug", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const res = await get(app, "does-not-exist/tools", tenant.apiKeyToken)
    expect(res.status).toBe(404)
  })
})
