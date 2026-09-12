import { generateId } from "@domain/shared"
import { agentScoreSnapshots } from "@platform/db-postgres/schema/agent-score-snapshots"
import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

interface Interval {
  readonly lower: number
  readonly upper: number
}

interface SnapshotResponse {
  readonly date: string
  readonly score: number
  readonly interval: Interval
  readonly dimensions: Record<string, { score: number; interval: Interval }>
  readonly scoringVersion: string
  readonly windowDays: number
  readonly eligibleSessionCount: number
  readonly policyCap: number | null
}

interface CurrentResponse {
  readonly available: boolean
  readonly date: string
  readonly snapshot: SnapshotResponse | null
}

const utcToday = () => new Date().toISOString().slice(0, 10)

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

const createProjectRecord = async (database: InMemoryPostgres, organizationId: string, name: string) => {
  const id = generateId()
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id.slice(0, 6)}`
  await database.db.insert(projects).values({ id, organizationId, name, slug })
  return { id, slug }
}

const insertSnapshot = async (
  database: InMemoryPostgres,
  input: { organizationId: string; projectId: string; date: string; score?: number; policyCap?: number },
) => {
  const dimension = (score: number) => ({ score, lower: score - 4, upper: score + 4 })
  const outcome = dimension(78)
  const reliability = dimension(36)
  const cost = dimension(84)
  const speed = dimension(72)
  const safety = dimension(90)

  await database.db.insert(agentScoreSnapshots).values({
    id: generateId(),
    organizationId: input.organizationId,
    projectId: input.projectId,
    date: input.date,
    scoringVersion: "agent-score-v1-provisional",
    windowDays: 7,
    eligibleSessionCount: 1_240,
    score: input.score ?? 69,
    scoreLower: 66.6,
    scoreUpper: 71.4,
    outcome: outcome.score,
    outcomeLower: outcome.lower,
    outcomeUpper: outcome.upper,
    reliability: reliability.score,
    reliabilityLower: reliability.lower,
    reliabilityUpper: reliability.upper,
    cost: cost.score,
    costLower: cost.lower,
    costUpper: cost.upper,
    speed: speed.score,
    speedLower: speed.lower,
    speedUpper: speed.upper,
    safety: safety.score,
    safetyLower: safety.lower,
    safetyUpper: safety.upper,
    policyCap: input.policyCap ?? null,
  })
}

describe("Agent Score Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("returns today's score with every dimension", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "Scored Project")
    await insertSnapshot(database, {
      organizationId: tenant.organizationId,
      projectId: project.id,
      date: utcToday(),
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${project.slug}/agent-score`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as CurrentResponse
    expect(body.available).toBe(true)
    expect(body.snapshot?.score).toBe(69)
    expect(Object.keys(body.snapshot?.dimensions ?? {}).sort()).toEqual([
      "cost",
      "outcome",
      "reliability",
      "safety",
      "speed",
    ])
    expect(body.snapshot?.dimensions.reliability).toEqual({ score: 36, interval: { lower: 32, upper: 40 } })
  })

  it<ApiTestContext>("says a score is unavailable rather than substituting an older one", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "Gap Project")
    await insertSnapshot(database, {
      organizationId: tenant.organizationId,
      projectId: project.id,
      date: daysAgo(3),
      score: 55,
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${project.slug}/agent-score`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as CurrentResponse
    expect(body).toMatchObject({ available: false, date: utcToday(), snapshot: null })
  })

  it<ApiTestContext>("returns history oldest first and leaves unpublished days out", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "History Project")
    await insertSnapshot(database, {
      organizationId: tenant.organizationId,
      projectId: project.id,
      date: daysAgo(3),
      score: 60,
    })
    await insertSnapshot(database, {
      organizationId: tenant.organizationId,
      projectId: project.id,
      date: daysAgo(1),
      score: 70,
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${project.slug}/agent-score/history`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { snapshots: SnapshotResponse[] }
    expect(body.snapshots.map((snapshot) => snapshot.score)).toEqual([60, 70])
    expect(body.snapshots).toHaveLength(2)
  })

  it<ApiTestContext>("honours an explicit history range", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "Ranged Project")
    await insertSnapshot(database, {
      organizationId: tenant.organizationId,
      projectId: project.id,
      date: daysAgo(10),
      score: 50,
    })
    await insertSnapshot(database, {
      organizationId: tenant.organizationId,
      projectId: project.id,
      date: daysAgo(2),
      score: 80,
    })

    const response = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${project.slug}/agent-score/history?from=${daysAgo(5)}&to=${daysAgo(1)}`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    const body = (await response.json()) as { snapshots: SnapshotResponse[] }
    expect(body.snapshots.map((snapshot) => snapshot.score)).toEqual([80])
  })

  it<ApiTestContext>("reports a policy cap and its absence", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "Capped Project")
    await insertSnapshot(database, {
      organizationId: tenant.organizationId,
      projectId: project.id,
      date: utcToday(),
      policyCap: 50,
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${project.slug}/agent-score`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    const body = (await response.json()) as CurrentResponse
    expect(body.snapshot?.policyCap).toBe(50)
  })

  it<ApiTestContext>("does not read another organization's score", async ({ app, database }) => {
    const tenantA = await createTenantSetup(database)
    const tenantB = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenantA.organizationId, "Private Project")
    await insertSnapshot(database, {
      organizationId: tenantA.organizationId,
      projectId: project.id,
      date: utcToday(),
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${project.slug}/agent-score`, {
        headers: createApiKeyAuthHeaders(tenantB.apiKeyToken),
      }),
    )

    expect(response.status).toBe(404)
  })
})
