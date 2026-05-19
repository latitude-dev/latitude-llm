import { alertIncidents } from "@platform/db-postgres/schema/alert-incidents"
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

interface IncidentSeed {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly sourceType: "issue"
  readonly sourceId: string
  readonly kind: "issue.new" | "issue.regressed" | "issue.escalating"
  readonly severity: "medium" | "high"
  readonly startedAt: Date
  readonly endedAt?: Date
}

const seedIncident = async (database: InMemoryPostgres, incident: IncidentSeed): Promise<void> => {
  await database.db.insert(alertIncidents).values({
    id: incident.id,
    organizationId: incident.organizationId,
    projectId: incident.projectId,
    sourceType: incident.sourceType,
    sourceId: incident.sourceId,
    kind: incident.kind,
    severity: incident.severity,
    startedAt: incident.startedAt,
    endedAt: incident.endedAt ?? null,
  })
}

describe("Incidents Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET / rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/incidents"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET / returns an empty list when the project has no incidents", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/incidents`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it<ApiTestContext>("GET / returns project incidents ordered by startedAt ascending", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)
    const sourceId = "issue111111111111111aaaa"

    await seedIncident(database, {
      id: "incid222222222222222aaaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.regressed",
      severity: "high",
      startedAt: new Date("2026-04-15T12:00:00.000Z"),
    })
    await seedIncident(database, {
      id: "incid333333333333333aaaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date("2026-04-15T08:00:00.000Z"),
      endedAt: new Date("2026-04-15T09:00:00.000Z"),
    })

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/incidents?fromIso=2026-04-01T00:00:00.000Z&toIso=2026-04-30T00:00:00.000Z`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: ReadonlyArray<{ id: string; kind: string; severity: string; startedAt: string; endedAt: string | null }>
    }
    expect(body.items.map((i) => i.id)).toEqual(["incid333333333333333aaaa", "incid222222222222222aaaa"])
    expect(body.items[0]?.endedAt).toBe("2026-04-15T09:00:00.000Z")
    expect(body.items[1]?.endedAt).toBeNull()
  })

  it<ApiTestContext>("GET / defaults to the trailing 7-day window when no time bounds are supplied", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "2222222222222222ffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)
    const sourceId = "issueddddddddddddddddddd"
    const now = Date.now()

    // Inside the default 7-day window — should be returned.
    await seedIncident(database, {
      id: "incidwithinwindow0000aaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date(now - 24 * 60 * 60 * 1000),
      endedAt: new Date(now - 12 * 60 * 60 * 1000),
    })
    // Closed before the window — should be excluded.
    await seedIncident(database, {
      id: "incidoutsidewindow000aaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      endedAt: new Date(now - 29 * 24 * 60 * 60 * 1000),
    })

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/incidents`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: ReadonlyArray<{ id: string }> }
    expect(body.items.map((i) => i.id)).toEqual(["incidwithinwindow0000aaa"])
  })

  it<ApiTestContext>("GET / filters by `kinds` when provided", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "cccccccccccccccccccccccc"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)
    const sourceId = "issue444444444444444aaaa"

    await seedIncident(database, {
      id: "incid444444444444444aaaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date("2026-04-10T00:00:00.000Z"),
    })
    await seedIncident(database, {
      id: "incid555555555555555aaaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.escalating",
      severity: "high",
      startedAt: new Date("2026-04-12T00:00:00.000Z"),
    })

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/incidents?fromIso=2026-04-01T00:00:00.000Z&toIso=2026-04-30T00:00:00.000Z&kinds=issue.escalating`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: ReadonlyArray<{ id: string; kind: string }> }
    expect(body.items.map((i) => i.id)).toEqual(["incid555555555555555aaaa"])
    expect(body.items[0]?.kind).toBe("issue.escalating")
  })

  it<ApiTestContext>("GET / unions repeated `kinds` query keys", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "4444444444444444ffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)
    const sourceId = "issuekkkkkkkkkkkkkkkkkkk"

    await seedIncident(database, {
      id: "incidkindnew000000000aaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date("2026-04-10T00:00:00.000Z"),
    })
    await seedIncident(database, {
      id: "incidkindreg000000000aaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.regressed",
      severity: "high",
      startedAt: new Date("2026-04-11T00:00:00.000Z"),
    })
    await seedIncident(database, {
      id: "incidkindesc000000000aaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.escalating",
      severity: "high",
      startedAt: new Date("2026-04-12T00:00:00.000Z"),
    })

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/incidents?fromIso=2026-04-01T00:00:00.000Z&toIso=2026-04-30T00:00:00.000Z&kinds=issue.new&kinds=issue.escalating`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: ReadonlyArray<{ id: string; kind: string }> }
    expect(body.items.map((i) => i.id)).toEqual(["incidkindnew000000000aaa", "incidkindesc000000000aaa"])
  })

  it<ApiTestContext>("GET / filters by `severities` when provided", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "dddddddddddddddddddddddd"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)
    const sourceId = "issue666666666666666aaaa"

    await seedIncident(database, {
      id: "incid666666666666666aaaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date("2026-04-10T00:00:00.000Z"),
    })
    await seedIncident(database, {
      id: "incid777777777777777aaaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.regressed",
      severity: "high",
      startedAt: new Date("2026-04-11T00:00:00.000Z"),
    })

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/incidents?fromIso=2026-04-01T00:00:00.000Z&toIso=2026-04-30T00:00:00.000Z&severities=medium`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: ReadonlyArray<{ id: string; severity: string }> }
    expect(body.items.map((i) => i.id)).toEqual(["incid666666666666666aaaa"])
    expect(body.items[0]?.severity).toBe("medium")
  })

  it<ApiTestContext>("GET / accepts `sourceTypes` as a single value or as repeated query params", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "3333333333333333ffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)
    const sourceId = "issuettttttttttttttttttt"

    await seedIncident(database, {
      id: "incidsourcetypeincluded0",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date("2026-04-10T00:00:00.000Z"),
    })

    const baseUrl = `http://localhost/v1/projects/${slug}/incidents?fromIso=2026-04-01T00:00:00.000Z&toIso=2026-04-30T00:00:00.000Z`

    const single = await app.fetch(
      new Request(`${baseUrl}&sourceTypes=issue`, { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }),
    )
    expect(single.status).toBe(200)
    const singleBody = (await single.json()) as { items: ReadonlyArray<{ id: string; sourceType: string }> }
    expect(singleBody.items.map((i) => i.id)).toEqual(["incidsourcetypeincluded0"])
    expect(singleBody.items[0]?.sourceType).toBe("issue")

    // Repeated keys also work — the only seeded source type is `issue`, and
    // duplicating the value keeps the filter idempotent.
    const repeated = await app.fetch(
      new Request(`${baseUrl}&sourceTypes=issue&sourceTypes=issue`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(repeated.status).toBe(200)
    const repeatedBody = (await repeated.json()) as { items: ReadonlyArray<{ id: string }> }
    expect(repeatedBody.items.map((i) => i.id)).toEqual(["incidsourcetypeincluded0"])
  })

  it<ApiTestContext>("GET / filters by `sourceId` when provided", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "eeeeeeeeeeeeeeeeeeeeeeee"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)
    const sourceA = "issueaaaaaaaaaaaaaaaaaaa"
    const sourceB = "issuebbbbbbbbbbbbbbbbbbb"

    await seedIncident(database, {
      id: "incid888888888888888aaaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId: sourceA,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date("2026-04-10T00:00:00.000Z"),
    })
    await seedIncident(database, {
      id: "incid999999999999999aaaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId: sourceB,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date("2026-04-11T00:00:00.000Z"),
    })

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/incidents?fromIso=2026-04-01T00:00:00.000Z&toIso=2026-04-30T00:00:00.000Z&sourceId=${sourceA}`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: ReadonlyArray<{ sourceId: string }> }
    expect(body.items.map((i) => i.sourceId)).toEqual([sourceA])
  })

  it<ApiTestContext>("GET / scopes by `[fromIso, toIso]` overlap when both bounds are provided", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "ffffffffffffffffffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)
    const sourceId = "issueccccccccccccccccccc"

    // Closed before the window — excluded.
    await seedIncident(database, {
      id: "incidaaaaaaaaaaaaaaaaaaa",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.new",
      severity: "medium",
      startedAt: new Date("2026-04-01T00:00:00.000Z"),
      endedAt: new Date("2026-04-01T01:00:00.000Z"),
    })
    // Overlaps the window — included.
    await seedIncident(database, {
      id: "incidbbbbbbbbbbbbbbbbbbb",
      organizationId: tenant.organizationId,
      projectId,
      sourceType: "issue",
      sourceId,
      kind: "issue.regressed",
      severity: "high",
      startedAt: new Date("2026-04-15T00:00:00.000Z"),
    })

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${slug}/incidents?fromIso=2026-04-14T00:00:00.000Z&toIso=2026-04-16T00:00:00.000Z`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: ReadonlyArray<{ id: string }> }
    expect(body.items.map((i) => i.id)).toEqual(["incidbbbbbbbbbbbbbbbbbbb"])
  })

  it<ApiTestContext>("GET / rejects an unknown `kinds` value with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "1111111111111111ffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/incidents?kinds=not-a-real-kind`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(400)
  })
})
