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

describe("Traces Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("POST /list rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(
      new Request("http://localhost/v1/projects/foo/traces/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("POST /list returns an empty paginated page when no traces are ingested", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/list`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
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
    const projectId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/list`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cursor: "not-a-valid-cursor" }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST /list rejects malformed `filters` with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "cccccccccccccccccccccccc"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/list`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filters: "not-an-object" }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST /list accepts a typed body with limit + sort overrides", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "999999999999999999999999"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/list`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: {},
          limit: 25,
          sortBy: "endTime",
          sortDirection: "asc",
        }),
      }),
    )

    expect(res.status).toBe(200)
  })

  it<ApiTestContext>("GET /{traceId} rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request(`http://localhost/v1/projects/foo/traces/${"0".repeat(32)}`))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /{traceId}/spans returns an empty items array when the trace has no spans", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "1111111111111111aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/${"0".repeat(32)}/spans`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it<ApiTestContext>("GET /{traceId}/spans rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request(`http://localhost/v1/projects/foo/traces/${"0".repeat(32)}/spans`))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /{traceId}/spans/{spanId} returns 404 for a non-existent span", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "1111111111111111bbbbbbbb"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/${"0".repeat(32)}/spans/${"0".repeat(16)}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{traceId}/spans/{spanId} rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/foo/traces/${"0".repeat(32)}/spans/${"0".repeat(16)}`),
    )
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /{traceId}/annotations returns an empty paginated page when the trace has no annotations", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "2222222222222222aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/${"0".repeat(32)}/annotations`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("GET /{traceId}/annotations rejects a malformed cursor with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "3333333333333333aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/traces/${"0".repeat(32)}/annotations?cursor=not-a-valid-cursor`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{traceId}/annotations rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request(`http://localhost/v1/projects/foo/traces/${"0".repeat(32)}/annotations`))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /{traceId}/annotations/{annotationId} returns 404 for a non-existent annotation", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "4444444444444444aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)
    // 24-char CUID-shaped placeholder (cuidSchema enforces length).
    const annotationId = "x".repeat(24)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/${"0".repeat(32)}/annotations/${annotationId}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{traceId}/annotations/{annotationId} rejects unauthenticated requests with 401", async ({
    app,
  }) => {
    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/foo/traces/${"0".repeat(32)}/annotations/${"x".repeat(24)}`),
    )
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("POST /export rejects a recipient who is not a member of the organization", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "dddddddddddddddddddddddd"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/export`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          traces: { by: "filters", filters: {} },
          recipient: "stranger@example.com",
        }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST /export enqueues the export when the recipient is an org member", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "eeeeeeeeeeeeeeeeeeeeeeee"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/export`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          traces: { by: "filters", filters: {} },
          recipient: `${tenant.userId}@example.com`,
        }),
      }),
    )

    expect(res.status).toBe(202)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe("queued")
  })

  it<ApiTestContext>("POST /export validates `recipient` shape with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "ffffffffffffffffffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/export`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          traces: { by: "filters", filters: {} },
          recipient: "not-an-email",
        }),
      }),
    )

    expect(res.status).toBe(400)
  })
})
