import { CacheError, CacheStore, OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { agentScoreExplanationCacheKey } from "../entities/agent-score-explanation.ts"
import { getAgentScoreExplanation } from "./get-agent-score-explanation.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))

const EXPLANATION = {
  organizationId: ORGANIZATION_ID as string,
  projectId: PROJECT_ID as string,
  scoringVersion: "agent-score@1.0.0",
  computedAt: "2026-09-12T04:00:00.000Z",
  window: { stepDays: 28, from: "2026-08-15T04:00:00.000Z", to: "2026-09-12T04:00:00.000Z" },
  eligibleSessionCount: 5037,
  readSessionCount: 5037,
  attribution: [],
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
    getAgentScoreExplanation({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID }).pipe(
      Effect.provide(withCachedValue(value)),
    ),
  )

describe("getAgentScoreExplanation", () => {
  it("reads the key under the organization prefix", () => {
    expect(agentScoreExplanationCacheKey({ organizationId: ORGANIZATION_ID, projectId: PROJECT_ID })).toBe(
      `org:${ORGANIZATION_ID}:agent-score:explanation:${PROJECT_ID}`,
    )
  })

  it("returns a cached explanation that still matches the shape", async () => {
    const result = await read(JSON.stringify(EXPLANATION))

    expect(result.status).toBe("ready")
    expect(result.status === "ready" && result.explanation.eligibleSessionCount).toBe(5037)
  })

  it("reads an entry from an incompatible shape as a miss rather than handing the page a hole", async () => {
    expect(await read("{}")).toEqual({ status: "notComputed" })
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
