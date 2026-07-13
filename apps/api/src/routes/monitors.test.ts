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

const target = {
  type: "session",
  id: null,
  filterSet: {},
  query: null,
} as const

const thresholdCondition = {
  trigger: "threshold",
  metric: { kind: "count" },
  threshold: { mode: "absolute", value: 1 },
  direction: "above",
} as const

const escalatingCondition = {
  trigger: "escalating",
  metric: { kind: "count" },
  threshold: { mode: "expected", sensitivity: 3 },
  direction: "above",
} as const

describe("Monitors Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("creates, lists, mutes, and unmutes a monitor", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "aaaaaaaaaaaaaaaaaaaaaaaa")
    const headers = { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" }

    const createRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/monitors`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "API threshold monitor",
          description: "Created from API QA",
          target,
          trigger: "threshold",
          metric: { kind: "count" },
          condition: thresholdCondition,
          severity: "high",
        }),
      }),
    )

    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as { slug: string; mutedAt: string | null; rule: { trigger: string } }
    expect(created.slug).toBe("api-threshold-monitor")
    expect(created.rule.trigger).toBe("threshold")
    expect(created.mutedAt).toBeNull()

    const listRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/monitors`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as { items: Array<{ slug: string }> }
    expect(list.items.map((item) => item.slug)).toContain(created.slug)

    const muteRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/monitors/${created.slug}/mute`, {
        method: "POST",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(muteRes.status).toBe(200)
    const muted = (await muteRes.json()) as { mutedAt: string | null }
    expect(muted.mutedAt).not.toBeNull()

    const unmuteRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/monitors/${created.slug}/unmute`, {
        method: "POST",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(unmuteRes.status).toBe(200)
    const unmuted = (await unmuteRes.json()) as { mutedAt: string | null }
    expect(unmuted.mutedAt).toBeNull()
  })

  it<ApiTestContext>("rejects invalid trigger and condition combinations", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "bbbbbbbbbbbbbbbbbbbbbbbb")
    const headers = { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" }

    const matchWithCondition = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/monitors`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Invalid match monitor",
          target,
          trigger: "match",
          condition: thresholdCondition,
          severity: "medium",
        }),
      }),
    )
    expect(matchWithCondition.status).toBe(400)

    const thresholdWithEscalatingCondition = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/monitors`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Invalid threshold monitor",
          target,
          trigger: "threshold",
          metric: { kind: "count" },
          condition: escalatingCondition,
          severity: "medium",
        }),
      }),
    )
    expect(thresholdWithEscalatingCondition.status).toBe(400)
  })

  it<ApiTestContext>("rejects escalating monitors with non-count metrics", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "cccccccccccccccccccccccc")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/monitors`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" },
        body: JSON.stringify({
          name: "Invalid escalating monitor",
          target,
          trigger: "escalating",
          metric: { kind: "errorRate" },
          condition: escalatingCondition,
          severity: "medium",
        }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("rejects gtePercentile on tool monitor span filters", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "dddddddddddddddddddddddd")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/monitors`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" },
        body: JSON.stringify({
          name: "Invalid tool monitor",
          target: {
            type: "tool",
            id: null,
            filterSet: { duration: [{ op: "gtePercentile", value: 90 }] },
          },
          trigger: "threshold",
          metric: { kind: "count" },
          condition: thresholdCondition,
          severity: "medium",
        }),
      }),
    )

    expect(res.status).toBe(400)
  })
})
