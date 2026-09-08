import { generateId } from "@domain/shared"
import { billingOverrides, billingUsageEvents, billingUsagePeriods } from "@platform/db-postgres/schema/billing"
import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

const now = new Date()
const PERIOD_START = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
const PERIOD_END = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

type UsageResponse = {
  plan: string
  period: { start: string; end: string }
  credits: { included: number | null; consumed: number; remaining: number | null; overage: number }
  categories: { category: string; credits: number }[]
  projects: {
    id: string
    slug: string | null
    name: string | null
    credits: number
    categories: { category: string; credits: number }[]
  }[]
}

const seedUsage = async (
  database: ApiTestContext["database"],
  organizationId: string,
  events: readonly { projectId: string; action: string; credits: number; idempotencyKey: string }[],
) => {
  await database.db.insert(billingOverrides).values({ id: generateId(), organizationId, plan: "free" })
  await database.db.insert(billingUsageEvents).values(
    events.map((event) => ({
      id: generateId(),
      organizationId,
      projectId: event.projectId,
      action: event.action,
      credits: event.credits,
      idempotencyKey: event.idempotencyKey,
      billingPeriodStart: PERIOD_START,
      billingPeriodEnd: PERIOD_END,
    })),
  )
  await database.db.insert(billingUsagePeriods).values({
    id: generateId(),
    organizationId,
    planSlug: "free",
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    includedCredits: 20_000,
    consumedCredits: events.reduce((sum, event) => sum + event.credits, 0),
  })
}

describe("Usage routes", () => {
  setupTestApi()

  it<ApiTestContext>("returns 401 without a bearer token", async ({ app }) => {
    const response = await app.fetch(new Request("http://localhost/v1/usage"))
    expect(response.status).toBe(401)
  })

  it<ApiTestContext>("returns the period credit position with category and project breakdowns", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const org = tenant.organizationId
    const agentId = generateId()
    const deletedProjectId = generateId()
    await database.db
      .insert(projects)
      .values({ id: agentId, organizationId: org, name: "Support Agent", slug: "support-agent" })

    await seedUsage(database, org, [
      { projectId: agentId, action: "trace", credits: 1, idempotencyKey: `trace:${org}:${agentId}:t1` },
      { projectId: agentId, action: "trace", credits: 1, idempotencyKey: `trace:${org}:${agentId}:t2` },
      { projectId: agentId, action: "eval-scan", credits: 1, idempotencyKey: `eval-scan:${org}:eval1:t1` },
      { projectId: agentId, action: "llm-call", credits: 6, idempotencyKey: `llm-call:${org}:live-eval:eval1:t1:0` },
      {
        projectId: agentId,
        action: "llm-call",
        credits: 9,
        idempotencyKey: `llm-call:${org}:session-analysis:run1:1:0`,
      },
      {
        projectId: deletedProjectId,
        action: "llm-call",
        credits: 4,
        idempotencyKey: `llm-call:${org}:flagger-classify:run2:1:0`,
      },
    ])

    const response = await app.fetch(
      new Request("http://localhost/v1/usage", { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as UsageResponse
    expect(body.plan).toBe("free")
    expect(body.period).toEqual({ start: PERIOD_START.toISOString(), end: PERIOD_END.toISOString() })
    expect(body.credits).toEqual({ included: 20_000, consumed: 22, remaining: 19_978, overage: 0 })
    expect(body.categories).toEqual([
      { category: "behaviors", credits: 9 },
      { category: "signals", credits: 7 },
      { category: "flaggers", credits: 4 },
      { category: "traces", credits: 2 },
    ])
    expect(body.projects).toEqual([
      {
        id: agentId,
        slug: "support-agent",
        name: "Support Agent",
        credits: 18,
        categories: [
          { category: "behaviors", credits: 9 },
          { category: "signals", credits: 7 },
          { category: "traces", credits: 2 },
        ],
      },
      { id: deletedProjectId, slug: null, name: null, credits: 4, categories: [{ category: "flaggers", credits: 4 }] },
    ])
  })

  it<ApiTestContext>("folds credits the period counter holds beyond the ledger into `other`", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const org = tenant.organizationId
    const projectId = generateId()
    await seedUsage(database, org, [
      { projectId, action: "trace", credits: 1, idempotencyKey: `trace:${org}:${projectId}:t1` },
    ])
    await database.db.update(billingUsagePeriods).set({ consumedCredits: 5 })

    const response = await app.fetch(
      new Request("http://localhost/v1/usage", { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }),
    )

    const body = (await response.json()) as UsageResponse
    expect(body.credits.consumed).toBe(5)
    expect(body.categories).toEqual([
      { category: "other", credits: 4 },
      { category: "traces", credits: 1 },
    ])
  })

  it<ApiTestContext>("scopes usage to the caller's organization", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    const projectB = generateId()
    await seedUsage(database, tenantB.organizationId, [
      {
        projectId: projectB,
        action: "trace",
        credits: 1,
        idempotencyKey: `trace:${tenantB.organizationId}:${projectB}:t1`,
      },
    ])

    const response = await app.fetch(
      new Request("http://localhost/v1/usage", { headers: createApiKeyAuthHeaders(tenantA.apiKeyToken) }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as UsageResponse
    expect(body.credits.consumed).toBe(0)
    expect(body.categories).toEqual([])
    expect(body.projects).toEqual([])
  })
})
