import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createOAuthAuthHeaders,
  createOAuthTenantSetup,
  createTenantSetup,
  setupTestApi,
} from "../test-utils/create-test-app.ts"

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

describe("Issues Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET / rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/issues"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET / returns an empty paginated page when the project has no issues", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("GET / rejects a malformed cursor with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues?cursor=not-a-valid-cursor`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{issueSlug} returns 404 for a non-existent issue", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "cccccccccccccccccccccccc"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues/missing-issue`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{issueSlug} rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/issues/some-issue"))
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
      new Request(`http://localhost/v1/projects/${slug}/issues/export`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient: "stranger@example.com" }),
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
      new Request(`http://localhost/v1/projects/${slug}/issues/export`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient: `${tenant.userId}@example.com` }),
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
      new Request(`http://localhost/v1/projects/${slug}/issues/export`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient: "not-an-email" }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST /export accepts a typed lifecycleGroup + issueIds body", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "1111111111111111aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues/export`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: `${tenant.userId}@example.com`,
          issueIds: ["a".repeat(24)],
          lifecycleGroup: "active",
        }),
      }),
    )

    expect(res.status).toBe(202)
  })

  it<ApiTestContext>("POST /resolve rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(
      new Request("http://localhost/v1/projects/foo/issues/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: ["a".repeat(24)] }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("POST /resolve returns empty items when the id list contains no real issues", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "2222222222222222aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    // No real issue seeded — the underlying lookup raises NotFoundError → 404.
    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues/resolve`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: ["a".repeat(24)] }),
      }),
    )
    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("POST /resolve rejects an empty issueIds list with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "3333333333333333aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues/resolve`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: [] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST /ignore + /unresolve + /unignore reject unauthenticated requests with 401", async ({
    app,
  }) => {
    for (const path of ["ignore", "unresolve", "unignore"]) {
      const res = await app.fetch(
        new Request(`http://localhost/v1/projects/foo/issues/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueIds: ["a".repeat(24)] }),
        }),
      )
      expect(res.status).toBe(401)
    }
  })

  it<ApiTestContext>("POST /{issueSlug}/monitor returns 404 for a non-existent issue (API-key caller)", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "4444444444444444aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues/some-issue/monitor`, {
        method: "POST",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("POST /{issueSlug}/monitor returns 404 for a non-existent issue (OAuth caller)", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "5555555555555555aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues/missing-issue/monitor`, {
        method: "POST",
        headers: createOAuthAuthHeaders(tenant.oauthAccessToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("POST /{issueSlug}/unmonitor returns 404 for a non-existent issue", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "6666666666666666aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues/missing-issue/unmonitor`, {
        method: "POST",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /analytics rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/issues/analytics"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET /analytics returns zeroed counters and empty buckets on an empty project", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "7777777777777777aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues/analytics`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ongoing: { total: number }
      new: { total: number }
      escalating: { total: number }
      regressed: { total: number }
      resolved: { total: number }
      occurrences: { total: number; buckets: ReadonlyArray<{ bucket: string; value: number }> }
    }
    expect(body.ongoing.total).toBe(0)
    expect(body.new.total).toBe(0)
    expect(body.escalating.total).toBe(0)
    expect(body.regressed.total).toBe(0)
    expect(body.resolved.total).toBe(0)
    expect(body.occurrences.total).toBe(0)
    expect(body.occurrences.buckets.every((b) => b.value === 0)).toBe(true)
    expect(body.occurrences.buckets.length).toBeGreaterThanOrEqual(14)
  })

  it<ApiTestContext>("GET /analytics rejects an inverted date range with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "8888888888888888aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/issues/analytics?fromIso=2026-04-15T00:00:00.000Z&toIso=2026-04-14T00:00:00.000Z`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /analytics scopes the bucket series to the requested range", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "9999999999999999aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/issues/analytics?fromIso=2026-04-15T00:00:00.000Z&toIso=2026-04-16T00:00:00.000Z`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { occurrences: { buckets: ReadonlyArray<{ bucket: string }> } }
    // 24h range with 12h UTC-aligned buckets → 3 bucket slots (start-inclusive, end-aligned).
    expect(body.occurrences.buckets.length).toBeGreaterThanOrEqual(2)
    expect(body.occurrences.buckets.length).toBeLessThanOrEqual(4)
    expect(body.occurrences.buckets[0]?.bucket.startsWith("2026-04-15")).toBe(true)
  })
})
