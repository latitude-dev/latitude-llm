import { eq } from "@platform/db-postgres"
import { outboxEvents } from "@platform/db-postgres/schema/outbox-events"
import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

const createProject = async (database: InMemoryPostgres, organizationId: string, projectId: string) => {
  const slug = `project-${projectId.slice(0, 8)}`
  await database.db.insert(projects).values({ id: projectId, organizationId, name: `Project ${projectId}`, slug })
  return slug
}

interface TraceDeletionResponse {
  readonly id: string
  readonly status: string
  readonly filters: Record<string, unknown>
  readonly requestedBy: { readonly type: string; readonly id: string }
  readonly matchedTraceCount: number
  readonly deletedRecordCount: number
  readonly completedAt: string | null
}

const byTag = { by: "filters", filters: { tags: [{ op: "contains", value: "customer:acme" }] } }

describe("Trace deletions routes", () => {
  setupTestApi()

  it<ApiTestContext>("previews, creates, lists and gets a trace deletion", async ({ app, database, clickhouse }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "dddddddddddddddddddddddd"
    const slug = await createProject(database, tenant.organizationId, projectId)
    const headers = { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" }
    const base = `http://localhost/v1/projects/${slug}/trace-deletions`

    await clickhouse.insert({
      table: "spans",
      format: "JSONEachRow",
      values: ["1", "2"].map((digit, index) => ({
        organization_id: tenant.organizationId,
        project_id: projectId,
        trace_id: digit.repeat(32),
        span_id: digit.repeat(16),
        tags: index === 0 ? ["customer:acme"] : ["customer:other"],
        start_time: "2026-01-01 00:00:00.000",
        end_time: "2026-01-01 00:00:01.000",
      })),
    })

    const preview = await app.fetch(
      new Request(`${base}/preview`, { method: "POST", headers, body: JSON.stringify({ traces: byTag }) }),
    )
    expect(preview.status).toBe(200)
    expect(await preview.json()).toEqual({ matchedTraceCount: 1 })

    const createRes = await app.fetch(
      new Request(base, { method: "POST", headers, body: JSON.stringify({ traces: byTag }) }),
    )
    expect(createRes.status).toBe(202)
    const created = (await createRes.json()) as TraceDeletionResponse
    expect(created).toMatchObject({
      status: "pending",
      filters: byTag.filters,
      requestedBy: { type: "api_key" },
      matchedTraceCount: 0,
      deletedRecordCount: 0,
      completedAt: null,
    })
    const events = await database.db
      .select({ eventName: outboxEvents.eventName })
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, created.id))
    expect(events).toEqual([{ eventName: "TraceDeletionRequestCreated" }])

    const listRes = await app.fetch(new Request(base, { headers }))
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as { items: TraceDeletionResponse[]; nextCursor: string | null }
    expect(list.items.map((item) => item.id)).toEqual([created.id])
    expect(list.nextCursor).toBeNull()

    const getRes = await app.fetch(new Request(`${base}/${created.id}`, { headers }))
    expect(getRes.status).toBe(200)
    expect(((await getRes.json()) as TraceDeletionResponse).id).toBe(created.id)
  })

  it<ApiTestContext>("folds explicit trace ids into the stored filter", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProject(database, tenant.organizationId, "eeeeeeeeeeeeeeeeeeeeeeee")
    const headers = { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/trace-deletions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ traces: { by: "ids", ids: ["a".repeat(32)] } }),
      }),
    )

    expect(res.status).toBe(202)
    expect(((await res.json()) as TraceDeletionResponse).filters).toEqual({
      traceId: [{ op: "in", value: ["a".repeat(32)] }],
    })
  })

  it<ApiTestContext>("rejects an empty filter, an unknown field and too many trace ids", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProject(database, tenant.organizationId, "ffffffffffffffffffffffff")
    const headers = { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" }
    const url = `http://localhost/v1/projects/${slug}/trace-deletions`

    const empty = await app.fetch(
      new Request(url, { method: "POST", headers, body: JSON.stringify({ traces: { by: "filters", filters: {} } }) }),
    )
    const unknownField = await app.fetch(
      new Request(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ traces: { by: "filters", filters: { tag: [{ op: "eq", value: "customer:acme" }] } } }),
      }),
    )
    const tooMany = await app.fetch(
      new Request(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          traces: { by: "ids", ids: Array.from({ length: 101 }, (_, i) => String(i).padStart(32, "0")) },
        }),
      }),
    )

    expect(empty.status).toBe(400)
    expect(unknownField.status).toBe(400)
    expect(tooMany.status).toBe(400)
  })

  it<ApiTestContext>("hides deletions of other projects", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slugA = await createProject(database, tenant.organizationId, "gggggggggggggggggggggggg")
    const slugB = await createProject(database, tenant.organizationId, "hhhhhhhhhhhhhhhhhhhhhhhh")
    const headers = { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" }

    const createRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${slugA}/trace-deletions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ traces: byTag }),
      }),
    )
    const created = (await createRes.json()) as TraceDeletionResponse

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slugB}/trace-deletions/${created.id}`, { headers }),
    )
    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("rejects unauthenticated requests", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/trace-deletions"))
    expect(res.status).toBe(401)
  })
})
