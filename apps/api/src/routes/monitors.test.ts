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
): Promise<string> => {
  const id = generateId()
  await database.db.insert(savedSearches).values({
    id,
    organizationId,
    projectId,
    slug: `search-${id.slice(0, 8)}`,
    name: `Search ${id}`,
    query: "errors",
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
    name: "Issue escalating",
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
  readonly projectSlug: string
  readonly savedSearchId: string
}

const setupUserMonitorTenant = async (database: InMemoryPostgres): Promise<UserMonitorSetup> => {
  const tenant = await createTenantSetup(database)
  const projectId = generateId()
  const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)
  const savedSearchId = await createSavedSearchRecord(database, tenant.organizationId, projectId)
  return { organizationId: tenant.organizationId, apiKeyToken: tenant.apiKeyToken, projectSlug, savedSearchId }
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
    source: { type: string; id: string | null }
    condition: unknown
    severity: string
  }[]
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

  it<ApiTestContext>("POST / rejects an empty alert list with 400", async ({ app, database }) => {
    const setup = await setupUserMonitorTenant(database)
    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(setup.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Empty", alerts: [] }),
      }),
    )
    expect(res.status).toBe(400)
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

  it<ApiTestContext>("alert CRUD: add a second alert, then deleting the last is rejected", async ({
    app,
    database,
  }) => {
    const setup = await setupUserMonitorTenant(database)
    const created = await createUserMonitor(app, setup)
    const firstAlertId = created.alerts[0]?.id as string

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
    expect(add.status).toBe(201)
    expect(((await add.json()) as MonitorResponse).alerts).toHaveLength(2)

    const del = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/alerts/${firstAlertId}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(del.status).toBe(204)

    // The monitor now has a single alert; removing it must be rejected.
    const remaining = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/alerts`, {
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    const lastAlertId = ((await remaining.json()) as { items: { id: string }[] }).items[0]?.id as string

    const delLast = await app.fetch(
      new Request(`http://localhost/v1/projects/${setup.projectSlug}/monitors/${created.slug}/alerts/${lastAlertId}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(setup.apiKeyToken),
      }),
    )
    expect(delLast.status).toBe(400)
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

  it<ApiTestContext>("system monitors reject delete, edit, and restructure but allow condition edits + mute", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = generateId()
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)
    const savedSearchId = await createSavedSearchRecord(database, tenant.organizationId, projectId)
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

    const addAlert = await app.fetch(
      new Request(`${base}/alerts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "savedSearch.match", source: { type: "savedSearch", id: savedSearchId } }),
      }),
    )
    expect(addAlert.status).toBe(403)

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
