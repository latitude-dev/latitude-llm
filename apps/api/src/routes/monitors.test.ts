import { generateId } from "@domain/shared"
import { monitorAlerts } from "@platform/db-postgres/schema/monitor-alerts"
import { monitors } from "@platform/db-postgres/schema/monitors"
import { projects } from "@platform/db-postgres/schema/projects"
import { savedSearches } from "@platform/db-postgres/schema/saved-searches"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

const createProjectRecord = async (
  database: InMemoryPostgres,
  organizationId: string,
  projectId: string,
): Promise<string> => {
  const slug = `project-${projectId.slice(0, 8)}`
  await database.db.insert(projects).values({ id: projectId, organizationId, name: `Project ${projectId}`, slug })
  return slug
}

const createSavedSearchRecord = async (
  database: InMemoryPostgres,
  organizationId: string,
  projectId: string,
  // Monitors reject searches with a semantic part, so the default fixture query is an exact literal.
  query = '"errors"',
): Promise<string> => {
  const id = generateId()
  await database.db.insert(savedSearches).values({
    id,
    organizationId,
    projectId,
    slug: `search-${id.slice(0, 8)}`,
    name: `Search ${id}`,
    query,
    filterSet: {},
  })
  return id
}

/** Inserts a system monitor with one `issue.escalating` alert (the locked shape we provision). */
const createSystemMonitorRecord = async (
  database: InMemoryPostgres,
  organizationId: string,
  projectId: string,
): Promise<{ slug: string; alertId: string }> => {
  const monitorId = generateId()
  const alertId = generateId()
  const slug = `system-${monitorId.slice(0, 8)}`
  await database.db.insert(monitors).values({
    id: monitorId,
    organizationId,
    projectId,
    slug,
    name: "Signal escalating",
    system: true,
  })
  await database.db.insert(monitorAlerts).values({
    id: alertId,
    organizationId,
    monitorId,
    kind: "issue.escalating",
    sourceType: "issue",
    sourceId: null,
    condition: { kind: "issue.escalating", sensitivity: 3 },
    severity: "high",
  })
  return { slug, alertId }
}

interface UserMonitorSetup {
  readonly organizationId: string
  readonly apiKeyToken: string
  readonly projectId: string
  readonly projectSlug: string
  readonly savedSearchId: string
}

const setupUserMonitorTenant = async (database: InMemoryPostgres): Promise<UserMonitorSetup> => {
  const tenant = await createTenantSetup(database)
  const projectId = generateId()
  const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)
  const savedSearchId = await createSavedSearchRecord(database, tenant.organizationId, projectId)
  return {
    organizationId: tenant.organizationId,
    apiKeyToken: tenant.apiKeyToken,
    projectId,
    projectSlug,
    savedSearchId,
  }
}

const matchAlertBody = (savedSearchId: string) => ({
  kind: "savedSearch.match" as const,
  source: { type: "savedSearch" as const, id: savedSearchId },
})

interface MonitorResponse {
  id: string
  slug: string
  name: string
  system: boolean
  mutedAt: string | null
  alerts: {
    id: string
    kind: string
    source: { type: string; id: string | null } | null
    condition: unknown
    severity: string
  }[]
  target: unknown | null
}

/** Creates a user monitor via the API and returns its parsed payload. */
const createUserMonitor = async (
  app: ApiTestContext["app"],
  setup: UserMonitorSetup,
  body?: Record<string, unknown>,
): Promise<MonitorResponse> => {
  const res = await app.fetch(
    new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors`, {
      method: "POST",
      headers: { ...createApiKeyAuthHeaders(setup.apiKeyToken), "Content-Type": "application/json" },
      body: JSON.stringify(body ?? { name: "Latency watch", alerts: [matchAlertBody(setup.savedSearchId)] }),
    }),
  )
  expect(res.status).toBe(201)
  return (await res.json()) as MonitorResponse
}

describe("Monitors Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET / rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/monitors"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET / returns an empty paginated page when no monitors exist", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("POST / creates a user monitor with a saved-search alert", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const monitor = await createUserMonitor(app, setup)

    expect(monitor.name).toBe("Latency watch")
    expect(monitor.slug).toMatch(/^latency-watch/)
    expect(monitor.system).toBe(false)
    expect(monitor.mutedAt).toBeNull()
    expect(monitor.alerts).toHaveLength(1)
    expect(monitor.alerts[0]?.kind).toBe("savedSearch.match")
    expect(monitor.alerts[0]?.source).toEqual({ type: "savedSearch", id: setup.savedSearchId })
    expect(monitor.alerts[0]?.condition).toBeNull()
  })

  it<ApiTestContext>("POST / creates a tool monitor and POST /for-target lists it", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const headers = { ...createApiKeyAuthHeaders(setup.apiKeyToken), "Content-Type": "application/json" }
    const target = {
      kind: "tool",
      stream: "spans",
      filterSet: {
        operation: [{ op: "eq", value: "execute_tool" }],
        toolName: [{ op: "eq", value: "search_docs" }],
      },
      query: null,
      savedSearchId: null,
      metric: { kind: "errorRate" },
    }

    const created = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Tool failures",
          alerts: [
            {
              kind: "metric.threshold",
              source: null,
              condition: {
                kind: "metric.threshold",
                metric: { kind: "errorRate" },
                threshold: { mode: "absolute", value: 0.1 },
              },
            },
          ],
          target,
        }),
      }),
    )
    expect(created.status).toBe(201)
    const monitor = (await created.json()) as MonitorResponse
    expect(monitor.alerts[0]?.source).toBeNull()
    expect(monitor.target).toEqual(target)

    const listed = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/for-target`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          stream: "spans",
          filterSetContains: {
            operation: [{ op: "eq", value: "execute_tool" }],
            toolName: [{ op: "eq", value: "search_docs" }],
          },
        }),
      }),
    )
    expect(listed.status).toBe(200)
    const body = (await listed.json()) as { items: MonitorResponse[] }
    expect(body.items.map((item) => item.id)).toContain(monitor.id)
  })

  it<ApiTestContext>("semantic saved searches cannot be watched: create and re-point are 400", async ({
    app,
    database,
  }) => {
    const setup = await setupUserMonitorTenant(database)
    // Unquoted free text is a semantic component — no exact rule to count matches against.
    const semanticSearchId = await createSavedSearchRecord(
      database,
      setup.organizationId,
      setup.projectId,
      "checkout failed",
    )
    const headers = { ...createApiKeyAuthHeaders(setup.apiKeyToken), "Content-Type": "application/json" }

    const created = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Semantic watch", alerts: [matchAlertBody(semanticSearchId)] }),
      }),
    )
    expect(created.status).toBe(400)
    expect(((await created.json()) as { error: string }).error).toContain("semantic")

    const monitor = await createUserMonitor(app, setup)
    const alertId = monitor.alerts[0]?.id as string
    const repointed = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${monitor.slug}/alerts/${alertId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ source: { type: "savedSearch", id: semanticSearchId } }),
      }),
    )
    expect(repointed.status).toBe(400)
    expect(((await repointed.json()) as { error: string }).error).toContain("semantic")
  })

  it<ApiTestContext>("POST / requires exactly one alert: empty and two-alert lists are 400", async ({
    app,
    database,
  }) => {
    const setup = await setupUserMonitorTenant(database)
    const post = (alerts: unknown[]) =>
      app.fetch(
        new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors`, {
          method: "POST",
          headers: { ...createApiKeyAuthHeaders(setup.apiKeyToken), "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Wrong alert count", alerts }),
        }),
      )

    expect((await post([])).status).toBe(400)
    expect((await post([matchAlertBody(setup.savedSearchId), matchAlertBody(setup.savedSearchId)])).status).toBe(400)
  })

  it<ApiTestContext>("POST / rejects a system-only alert kind with 400", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(setup.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bad kind",
          alerts: [{ kind: "issue.new", source: { type: "issue", id: null } }],
        }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST / rejects a threshold alert missing its condition with 400", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(setup.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "No condition",
          alerts: [{ kind: "savedSearch.threshold", source: { type: "savedSearch", id: setup.savedSearchId } }],
        }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{slug} returns the monitor; unknown slug is 404", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const created = await createUserMonitor(app, setup)

    const ok = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as MonitorResponse).id).toBe(created.id)

    const missing = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/does-not-exist`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(missing.status).toBe(404)
  })

  it<ApiTestContext>("PATCH /{slug} updates the name", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const created = await createUserMonitor(app, setup)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}`, {
        method: "PATCH",
        headers: { ...createApiKeyAuthHeaders(setup.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed watch" }),
      }),
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as MonitorResponse).name).toBe("Renamed watch")
  })

  it<ApiTestContext>("alert reads: list + get by id, 404 on unknown alert", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const created = await createUserMonitor(app, setup)
    const alertId = created.alerts[0]?.id as string

    const list = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/alerts`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(list.status).toBe(200)
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(1)

    const get = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/alerts/${alertId}`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(get.status).toBe(200)

    const missing = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/alerts/${generateId()}`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(missing.status).toBe(404)
  })

  it<ApiTestContext>("alerts are immutable in shape: adding and deleting alerts is not exposed", async ({
    app,
    database,
  }) => {
    const setup = await setupUserMonitorTenant(database)
    const created = await createUserMonitor(app, setup)
    const alertId = created.alerts[0]?.id as string

    // A monitor keeps the single alert it was created with — the POST route no longer exists.
    const add = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/alerts`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(setup.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "savedSearch.threshold",
          source: { type: "savedSearch", id: setup.savedSearchId },
          condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 100 } },
        }),
      }),
    )
    expect(add.status).toBe(404)

    // Alerts are edited in place, never deleted — the DELETE route no longer exists either.
    const del = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/alerts/${alertId}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(del.status).toBe(404)
  })

  it<ApiTestContext>("mute then unmute toggles mutedAt", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const created = await createUserMonitor(app, setup)

    const muted = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/mute`, {
        method: "POST",
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(muted.status).toBe(200)
    expect(((await muted.json()) as MonitorResponse).mutedAt).not.toBeNull()

    const unmuted = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/unmute`, {
        method: "POST",
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(unmuted.status).toBe(200)
    expect(((await unmuted.json()) as MonitorResponse).mutedAt).toBeNull()
  })

  it<ApiTestContext>("GET /{slug}/incidents returns an empty page when none exist", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const created = await createUserMonitor(app, setup)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/incidents`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("system monitors reject delete and edit but allow condition edits + mute", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = generateId()
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)
    const system = await createSystemMonitorRecord(database, tenant.organizationId, projectId)
    const headers = createApiKeyAuthHeaders(tenant.apiKeyToken)
    const base = `http://localhost/v1/projects/${projectSlug}/monitors/${system.slug}`

    const del = await app.fetch(new Request(base, { method: "DELETE", headers }))
    expect(del.status).toBe(403)

    const edit = await app.fetch(
      new Request(base, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed system" }),
      }),
    )
    expect(edit.status).toBe(403)

    const severityChange = await app.fetch(
      new Request(`${base}/alerts/${system.alertId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ severity: "low" }),
      }),
    )
    expect(severityChange.status).toBe(403)

    const conditionEdit = await app.fetch(
      new Request(`${base}/alerts/${system.alertId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ condition: { kind: "issue.escalating", sensitivity: 5 } }),
      }),
    )
    expect(conditionEdit.status).toBe(200)

    const mute = await app.fetch(new Request(`${base}/mute`, { method: "POST", headers }))
    expect(mute.status).toBe(200)
  })
})
