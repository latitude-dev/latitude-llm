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

describe("Sessions Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("POST /list rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(
      new Request("http://localhost/v1/projects/foo/sessions/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("POST /list returns an empty paginated page when no sessions exist", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "aaaaaaaaaaaaaaaaaaaaaaaa")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/list`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("POST /list rejects a malformed cursor with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "bbbbbbbbbbbbbbbbbbbbbbbb")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/list`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ cursor: "not-a-valid-cursor" }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST /list accepts the session-only `moments` and `topics` filters", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "444444444444444444444444")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/list`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            moments: [{ op: "in", value: ["escalation"] }],
            topics: [{ op: "in", value: ["cluster-abc"] }],
          },
        }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it<ApiTestContext>("POST /list rejects an unknown filter field with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "555555555555555555555555")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/list`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ filters: { bogusField: [{ op: "eq", value: 1 }] } }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /analytics rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/sessions/analytics"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /analytics returns zeroed metrics and empty buckets on an empty project", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "cccccccccccccccccccccccc")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/analytics`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      sessions: { total: number; buckets: unknown[] }
      traces: { total: number }
      spans: { total: number }
    }
    expect(body.sessions.total).toBe(0)
    expect(body.traces.total).toBe(0)
    expect(body.spans.total).toBe(0)
    expect(Array.isArray(body.sessions.buckets)).toBe(true)
  })

  it<ApiTestContext>("GET /analytics rejects an inverted date range with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "dddddddddddddddddddddddd")

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/sessions/analytics?fromIso=2026-04-15T00:00:00.000Z&toIso=2026-04-14T00:00:00.000Z`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{sessionId} returns 404 for an unknown session", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "eeeeeeeeeeeeeeeeeeeeeeee")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/unknown-session`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{sessionId} rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/sessions/some-session"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /{sessionId}/traces returns an empty page for a session with no traces", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "ffffffffffffffffffffffff")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/unknown-session/traces`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("GET /{sessionId}/traces rejects a malformed cursor with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "111111111111111111111111")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/some-session/traces?cursor=not-valid`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{sessionId}/signals returns 404 for an unknown session", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "222222222222222222222222")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/unknown-session/signals`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{sessionId}/signals rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/sessions/some-session/signals"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /{sessionId}/signals/{signalSlug} returns 404 for an unknown session", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "333333333333333333333333")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/unknown-session/signals/some-signal`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{sessionId}/memory returns an empty footprint when the session touched no memory", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "666666666666666666666666")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/unknown-session/memory`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { records: unknown[]; total: { writeRecords: number } }
    expect(body.records).toEqual([])
    expect(body.total.writeRecords).toBe(0)
  })

  it<ApiTestContext>("GET /{sessionId}/memory rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/sessions/some-session/memory"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /{sessionId}/memory/changes returns an empty change set when the session wrote no memory", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "777777777777777777777777")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/sessions/unknown-session/memory/changes`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { records: unknown[] }
    expect(body.records).toEqual([])
  })
})
