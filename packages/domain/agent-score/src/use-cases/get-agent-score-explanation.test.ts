import { CacheError, CacheStore, OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  agentScoreExplanationCacheKey,
  agentScoreExplanationSchema,
  latestAgentScoreExplanationCacheKey,
} from "../entities/agent-score-explanation.ts"
import { AgentScoreSnapshotRepository } from "../ports/agent-score-snapshot-repository.ts"
import {
  cacheAgentScoreExplanation,
  getAgentScoreExplanation,
  getLatestAgentScoreExplanation,
  shouldAdvanceLatestExplanation,
} from "./get-agent-score-explanation.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const DATE = "2026-09-12"

const EXPLANATION = {
  organizationId: ORGANIZATION_ID as string,
  projectId: PROJECT_ID as string,
  date: DATE,
  scoringVersion: "agent-score@1.0.0",
  computedAt: "2026-09-12T04:00:00.000Z",
  window: { stepDays: 28, from: "2026-08-15T04:00:00.000Z", to: "2026-09-12T04:00:00.000Z" },
  eligibleSessionCount: 5037,
  readSessionCount: 5037,
  publication: {
    status: "published",
    sessionFloor: 200,
    dimensions: [],
  },
  attribution: [],
  observedCauses: [],
  issues: { outcome: [], safety: { confirmedHarm: [], exposure: [] } },
  coverage: {
    cost: {
      coverage: "measured",
      families: [],
      publishableSessionCount: 5037,
      withheldSessionCount: 0,
      publishableSessionShare: 1,
    },
    speed: {
      coverage: "measured",
      completeSessionCount: 5037,
      incompleteSessionCount: 0,
      completeShareOfEligible: 1,
    },
    readers: [],
    outcomeExaminedSessions: 400,
    safetyExaminedSessions: 100,
    reliabilityReadableSessions: 5037,
    unmeasuredSignalEffects: 0,
    artifactVersions: { cost: "cost@1", costCatalog: "catalog@1", latency: "latency@1" },
  },
  readiness: {
    sessionRequirement: {
      kind: "threshold",
      metric: "eligibleSessions",
      current: 5037,
      required: 200,
      comparison: "atLeast",
      unit: "sessions",
      met: true,
    },
    dimensions: [],
  },
  native: { observedCriticalPathNs: 1, avoidableCriticalPathNs: 0, costFamilyPenalties: {} },
}

const withCachedValue = (value: string | null | Effect.Effect<string | null, CacheError>) =>
  Layer.succeed(CacheStore, {
    get: () => (Effect.isEffect(value) ? value : Effect.succeed(value)),
    set: () => Effect.void,
    delete: () => Effect.void,
  })

const read = (value: string | null | Effect.Effect<string | null, CacheError>) =>
  Effect.runPromise(
    getAgentScoreExplanation({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, date: DATE }).pipe(
      Effect.provide(withCachedValue(value)),
      Effect.provideService(AgentScoreSnapshotRepository, {
        findByDate: () => Effect.succeed(null),
        findLatest: () => Effect.succeed(null),
        listHistory: () => Effect.succeed([]),
        insertIfAbsent: () => Effect.succeed(false),
      }),
      Effect.provideService(SqlClient, {} as SqlClientShape),
    ),
  )

const readLatest = (value: string | null | Effect.Effect<string | null, CacheError>) =>
  Effect.runPromise(
    getLatestAgentScoreExplanation({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID }).pipe(
      Effect.provide(withCachedValue(value)),
    ),
  )

const withCachedEntries = (entries: Record<string, string>) =>
  Layer.succeed(CacheStore, {
    get: (key: string) => Effect.succeed(entries[key] ?? null),
    set: () => Effect.void,
    delete: () => Effect.void,
  })

const readLatestWithEntries = (entries: Record<string, string>) =>
  Effect.runPromise(
    getLatestAgentScoreExplanation({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID }).pipe(
      Effect.provide(withCachedEntries(entries)),
    ),
  )

describe("getAgentScoreExplanation", () => {
  it("reads the key under the organization prefix", () => {
    expect(agentScoreExplanationCacheKey({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, date: DATE })).toBe(
      `org:${ORGANIZATION_ID}:agent-score:explanation:${PROJECT_ID}:${DATE}`,
    )
    expect(latestAgentScoreExplanationCacheKey({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID })).toBe(
      `org:${ORGANIZATION_ID}:agent-score:latest-explanation:${PROJECT_ID}`,
    )
  })

  it("returns a cached explanation that still matches the shape", async () => {
    const result = await read(JSON.stringify(EXPLANATION))

    expect(result.status).toBe("ready")
    expect(result.status === "ready" && result.explanation.eligibleSessionCount).toBe(5037)
  })

  it("does not substitute another date's cached evidence", async () => {
    await expect(read(JSON.stringify({ ...EXPLANATION, date: "2026-09-11" }))).resolves.toEqual({
      status: "notComputed",
    })
  })

  it("does not use cached evidence for another project", async () => {
    await expect(read(JSON.stringify({ ...EXPLANATION, projectId: "another-project" }))).resolves.toEqual({
      status: "notComputed",
    })
  })

  it("returns the latest published explanation independently from the current date", async () => {
    const result = await readLatest(JSON.stringify(EXPLANATION))

    expect(result.status).toBe("ready")
    expect(result.status === "ready" && result.explanation.date).toBe(DATE)
  })

  it("falls back to the legacy project key when the latest key misses", async () => {
    const result = await readLatestWithEntries({
      [`org:${ORGANIZATION_ID}:agent-score:explanation:${PROJECT_ID}`]: JSON.stringify(EXPLANATION),
    })

    expect(result.status).toBe("ready")
    expect(result.status === "ready" && result.explanation.date).toBe(DATE)
  })

  it("prefers the latest published key over the legacy project key", async () => {
    const result = await readLatestWithEntries({
      [latestAgentScoreExplanationCacheKey({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID })]: JSON.stringify(
        { ...EXPLANATION, eligibleSessionCount: 1 },
      ),
      [`org:${ORGANIZATION_ID}:agent-score:explanation:${PROJECT_ID}`]: JSON.stringify(EXPLANATION),
    })

    expect(result.status === "ready" && result.explanation.eligibleSessionCount).toBe(1)
  })

  it("reads an entry from an incompatible shape as a miss rather than handing the page a hole", async () => {
    expect(await read("{}")).toEqual({ status: "notComputed" })
    expect(await read(JSON.stringify({ ...EXPLANATION, date: undefined }))).toEqual({ status: "notComputed" })
    expect(await read(JSON.stringify({ ...EXPLANATION, coverage: undefined }))).toEqual({ status: "notComputed" })
  })

  it("reads unparseable JSON as a miss", async () => {
    expect(await read("not json")).toEqual({ status: "notComputed" })
  })

  it("reads a cache that cannot be reached as a miss, never a failed page", async () => {
    expect(await read(Effect.fail(new CacheError({ message: "cache unavailable" })))).toEqual({
      status: "notComputed",
    })
  })
})

describe("shouldAdvanceLatestExplanation", () => {
  it("advances when nothing is cached yet", () => {
    expect(shouldAdvanceLatestExplanation({ existingDate: null, incomingDate: "2026-09-15" })).toBe(true)
  })

  it("advances for a newer or equal date", () => {
    expect(shouldAdvanceLatestExplanation({ existingDate: "2026-09-15", incomingDate: "2026-09-17" })).toBe(true)
    expect(shouldAdvanceLatestExplanation({ existingDate: "2026-09-15", incomingDate: "2026-09-15" })).toBe(true)
  })

  it("holds the pointer when an older backfill finishes late", () => {
    expect(shouldAdvanceLatestExplanation({ existingDate: "2026-09-17", incomingDate: "2026-09-15" })).toBe(false)
  })
})

describe("cacheAgentScoreExplanation latest pointer", () => {
  const makeResult = (date: string) =>
    ({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      scoringVersion: "agent-score@1.0.0",
      sessionFloor: 200,
      status: "published",
      window: {
        stepDays: 7,
        from: new Date("2026-09-08T00:00:00.000Z"),
        to: new Date(`${date}T00:00:00.000Z`),
        reason: "reachedTarget",
        eligibleSessionCount: 1503,
      },
      dimensions: [{ scoreDimension: "reliability", weight: 0.2, coverage: "measured" }],
      coverage: {
        eligibleSessionCount: 1503,
        readSessionCount: 1503,
        outcome: { examinedSessionCount: 400 },
        reliability: { readableSessionCount: 1503 },
        safety: { examinedSessionCount: 100 },
        cost: {
          coverage: "measured",
          families: [],
          publishableSessionCount: 1503,
          withheldSessionCount: 0,
          publishableSessionShare: 1,
        },
        speed: {
          coverage: "measured",
          completeSessionCount: 1503,
          incompleteSessionCount: 0,
          completeShareOfEligible: 1,
        },
        readers: [],
        artifactVersions: { cost: "cost@1", costCatalog: "catalog@1", latency: "latency@1" },
        unmeasuredSignalEffects: 0,
      },
      native: {
        cost: { familyPenalties: {} },
        speed: { observedNs: 1, avoidableNs: 0 },
      },
      readiness: EXPLANATION.readiness,
    }) as unknown as Parameters<typeof cacheAgentScoreExplanation>[0]["result"]

  const withMemoryStore = (store: Map<string, string>) =>
    Layer.succeed(CacheStore, {
      get: (key: string) => Effect.succeed(store.get(key) ?? null),
      set: (key: string, value: string) => Effect.sync(() => void store.set(key, value)),
      delete: (key: string) => Effect.sync(() => void store.delete(key)),
    })

  const latestDateOf = (store: Map<string, string>): string | null => {
    const cached = store.get(
      latestAgentScoreExplanationCacheKey({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID }),
    )
    if (!cached) return null
    return (JSON.parse(cached) as { date: string }).date
  }

  it("keeps a newer latest explanation when an older backfill finishes after it", async () => {
    const store = new Map<string, string>()
    const layer = withMemoryStore(store)

    await Effect.runPromise(
      cacheAgentScoreExplanation({ result: makeResult("2026-09-17"), date: "2026-09-17" }).pipe(Effect.provide(layer)),
    )
    await Effect.runPromise(
      cacheAgentScoreExplanation({ result: makeResult("2026-09-15"), date: "2026-09-15" }).pipe(Effect.provide(layer)),
    )

    expect(latestDateOf(store)).toBe("2026-09-17")
    expect(
      store.has(
        agentScoreExplanationCacheKey({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, date: "2026-09-15" }),
      ),
    ).toBe(true)
  })

  it("advances the pointer for a newer publication and replaces an unreadable entry", async () => {
    const store = new Map<string, string>()
    const layer = withMemoryStore(store)

    await Effect.runPromise(
      cacheAgentScoreExplanation({ result: makeResult("2026-09-15"), date: "2026-09-15" }).pipe(Effect.provide(layer)),
    )
    await Effect.runPromise(
      cacheAgentScoreExplanation({ result: makeResult("2026-09-17"), date: "2026-09-17" }).pipe(Effect.provide(layer)),
    )
    expect(latestDateOf(store)).toBe("2026-09-17")

    store.set(
      latestAgentScoreExplanationCacheKey({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID }),
      "not json",
    )
    await Effect.runPromise(
      cacheAgentScoreExplanation({ result: makeResult("2026-09-18"), date: "2026-09-18" }).pipe(Effect.provide(layer)),
    )
    expect(latestDateOf(store)).toBe("2026-09-18")
  })
})

/**
 * v6 stopped emitting the Outcome and Safety share floors and started reporting the judged sample
 * apart from the deterministic census. Snapshots and cache entries written before that are still
 * read back, so the shapes they carry have to keep parsing — a rollout that silently dropped every
 * stored explanation would look like an outage rather than a version bump.
 */
describe("explanations stored under an earlier scoring version", () => {
  const v4 = {
    ...EXPLANATION,
    scoringVersion: "agent-score-v5-provisional",
    publication: {
      ...EXPLANATION.publication,
      status: "withheld",
      reason: "unmeasuredDimensions",
      dimensions: [{ scoreDimension: "outcome", coverage: "unmeasured", unmeasuredReason: "coverageFloor" }],
    },
    readiness: {
      ...EXPLANATION.readiness,
      dimensions: [
        {
          scoreDimension: "outcome",
          requirements: [
            {
              kind: "threshold",
              metric: "outcomeCoverage",
              current: 0.029,
              required: 0.05,
              comparison: "atLeast",
              unit: "fraction",
              met: false,
            },
          ],
        },
      ],
    },
  }

  it("still decode, retired share requirement and all", () => {
    const parsed = agentScoreExplanationSchema.safeParse(v4)

    expect(parsed.success).toBe(true)
    expect(parsed.data?.readiness.dimensions[0]?.requirements[0]).toMatchObject({ metric: "outcomeCoverage" })
    expect(parsed.data?.publication.dimensions[0]).toMatchObject({ unmeasuredReason: "coverageFloor" })
  })

  it("decode without the judged-sample count, which only v6 writes", () => {
    const parsed = agentScoreExplanationSchema.safeParse(v4)

    expect(parsed.data?.coverage.outcomeSampledSessions).toBeUndefined()
    expect(parsed.data?.coverage.outcomeExaminedSessions).toBe(400)
  })
})
