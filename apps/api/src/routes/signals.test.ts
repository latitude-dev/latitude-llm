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

describe("Signals Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET / rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/signals"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("redirects the legacy /issues path to /signals with 307", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "0000000000000000aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/issues/resolve`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" },
        body: JSON.stringify({ signalIds: ["cccccccccccccccccccccccc"] }),
        redirect: "manual",
      }),
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain(`/v1/projects/${slug}/signals/resolve`)
  })

  it<ApiTestContext>("GET / returns an empty paginated page when the project has no issues", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/signals`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: unknown[]
      summary: {
        totalCount: number
        hasAnySignals: boolean
        analytics: { counts: { newSignals: number; escalatingSignals: number; ongoingSignals: number } }
      }
      nextCursor: string | null
      hasMore: boolean
    }
    expect(body.items).toEqual([])
    expect(body.summary.totalCount).toBe(0)
    expect(body.summary.hasAnySignals).toBe(false)
    expect(body.summary.analytics.counts.newSignals).toBe(0)
    expect(body.summary.analytics.counts.escalatingSignals).toBe(0)
    expect(body.summary.analytics.counts.ongoingSignals).toBe(0)
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("GET / rejects a malformed cursor with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/signals?cursor=not-a-valid-cursor`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{signalSlug} returns 404 for a non-existent issue", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "cccccccccccccccccccccccc"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/signals/missing-issue`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{signalSlug} rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/signals/some-issue"))
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
      new Request(`http://localhost/v1/projects/${slug}/signals/export`, {
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
      new Request(`http://localhost/v1/projects/${slug}/signals/export`, {
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
      new Request(`http://localhost/v1/projects/${slug}/signals/export`, {
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

  it<ApiTestContext>("POST /export accepts a typed lifecycleGroup + signalIds body", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "1111111111111111aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/signals/export`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: `${tenant.userId}@example.com`,
          signalIds: ["a".repeat(24)],
          lifecycleGroup: "active",
        }),
      }),
    )

    expect(res.status).toBe(202)
  })

  it<ApiTestContext>("POST /resolve rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(
      new Request("http://localhost/v1/projects/foo/signals/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalIds: ["a".repeat(24)] }),
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
      new Request(`http://localhost/v1/projects/${slug}/signals/resolve`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ signalIds: ["a".repeat(24)] }),
      }),
    )
    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("POST /mute rejects an empty signalIds list with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "3333333333333333aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/signals/mute`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ signalIds: [] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST /ignore + /unresolve + /unignore reject unauthenticated requests with 401", async ({
    app,
  }) => {
    for (const path of ["ignore", "unresolve", "unignore"]) {
      const res = await app.fetch(
        new Request(`http://localhost/v1/projects/foo/signals/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signalIds: ["a".repeat(24)] }),
        }),
      )
      expect(res.status).toBe(401)
    }
  })

  it<ApiTestContext>("POST /{signalSlug}/monitor returns 404 for a non-existent issue (API-key caller)", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "4444444444444444aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/signals/some-issue/monitor`, {
        method: "POST",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("POST /{signalSlug}/monitor returns 404 for a non-existent issue (OAuth caller)", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "5555555555555555aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/signals/missing-issue/monitor`, {
        method: "POST",
        headers: createOAuthAuthHeaders(tenant.oauthAccessToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("POST /{signalSlug}/unmonitor returns 404 for a non-existent issue", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "6666666666666666aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/signals/missing-issue/unmonitor`, {
        method: "POST",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET / returns zeroed summary analytics on an empty project", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "7777777777777777aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/signals`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      summary: {
        analytics: {
          counts: { newSignals: number; escalatingSignals: number; ongoingSignals: number; seenOccurrences: number }
          histogram: ReadonlyArray<{ bucket: string; count: number }>
          totalSessions: number
        }
        occurrencesSum: number
      }
    }
    expect(body.summary.analytics.counts.newSignals).toBe(0)
    expect(body.summary.analytics.counts.escalatingSignals).toBe(0)
    expect(body.summary.analytics.counts.ongoingSignals).toBe(0)
    expect(body.summary.analytics.counts.seenOccurrences).toBe(0)
    expect(body.summary.occurrencesSum).toBe(0)
    expect(body.summary.analytics.totalSessions).toBe(0)
    expect(body.summary.analytics.histogram.every((b) => b.count === 0)).toBe(true)
    expect(body.summary.analytics.histogram.length).toBeGreaterThanOrEqual(14)
  })

  it<ApiTestContext>("GET / rejects an inverted date range with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "8888888888888888aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/signals?fromIso=2026-04-15T00:00:00.000Z&toIso=2026-04-14T00:00:00.000Z`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET / scopes the summary histogram to the requested range", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "9999999999999999aaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/signals?fromIso=2026-04-15T00:00:00.000Z&toIso=2026-04-16T00:00:00.000Z`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { summary: { analytics: { histogram: ReadonlyArray<{ bucket: string }> } } }
    expect(body.summary.analytics.histogram.length).toBeGreaterThanOrEqual(2)
    expect(body.summary.analytics.histogram.length).toBeLessThanOrEqual(4)
    expect(body.summary.analytics.histogram[0]?.bucket.startsWith("2026-04-15")).toBe(true)
  })
})
