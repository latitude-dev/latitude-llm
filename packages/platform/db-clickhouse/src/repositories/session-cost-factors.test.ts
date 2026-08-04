import { type ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { createSeedScope, SEED_API_KEY_ID } from "@domain/shared/seeding"
import {
  CostAnalyticsRepository,
  type CostAnalyticsRepositoryShape,
  decomposeCostPerSession,
  type SessionCostFactor,
  sessionCostMicrocents,
  sessionCostTokens,
} from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { buildCohortsSpans, type CostCohort } from "../seeds/spans/cost-archetypes/cohorts.ts"
import { GPT_5_MINI } from "../seeds/spans/cost-archetypes/models.ts"
import { REGRESSION_COHORTS } from "../seeds/spans/cost-archetypes/regression.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { CostAnalyticsRepositoryLive } from "./cost-analytics-repository.ts"

const ORG_ID = OrganizationId("o".repeat(24))

// Archetype D split three ways: each cause on its own project so the row that has
// to carry it can be asserted in isolation, plus the blend the project really shows.
const BLENDED_PROJECT_ID = ProjectId("sessionfactorsblended000")
const MIX_PROJECT_ID = ProjectId("sessionfactorsmix0000000")
const PROMPT_PROJECT_ID = ProjectId("sessionfactorsprompt0000")
const PARITY_PROJECT_ID = ProjectId("sessionfactorsparity0000")

const ANCHOR = new Date("2026-06-16T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/**
 * The boundary sits halfway through the 24h gap between the newest "before" call
 * and the oldest "after" one, so neither period can steal a cluster from the
 * other, and `previousFrom` clears the oldest cluster's own few minutes of spread.
 * Both windows are the same length by construction, which is what the card claims.
 */
const PERIOD_MS = 28 * DAY_MS
const TO = new Date(ANCHOR.getTime() + 12 * HOUR_MS)
const FROM = new Date(TO.getTime() - PERIOD_MS)
const PREVIOUS_FROM = new Date(FROM.getTime() - PERIOD_MS)

const scopeFor = (projectId: ProjectId) =>
  createSeedScope({ organizationId: ORG_ID, projectId, timelineAnchor: ANCHOR, apiKeyId: SEED_API_KEY_ID })

const cohortsOf = (serviceName: string): readonly CostCohort[] =>
  REGRESSION_COHORTS.filter((cohort) => cohort.serviceName === serviceName)

const spansOf = (cohorts: readonly CostCohort[], projectId: ProjectId): SpanRow[] =>
  buildCohortsSpans(cohorts, scopeFor(projectId), ANCHOR.getTime())

/** Half the calls report no session id, so both keying paths run in one project. */
const PARITY_COHORTS: readonly CostCohort[] = [
  {
    key: "parity-sessioned",
    serviceName: "parity",
    modelConfig: GPT_5_MINI,
    cadence: { endDaysAgo: 0, clusters: 20, clusterSpacingHours: 24, callsPerCluster: 3, gapWithinClusterSeconds: 60 },
    cache: { kind: "off" },
    promptTokens: 2_000,
    completionTokens: 100,
    callsPerSession: 3,
  },
  {
    key: "parity-sessionless",
    serviceName: "parity",
    modelConfig: GPT_5_MINI,
    cadence: { endDaysAgo: 0, clusters: 20, clusterSpacingHours: 24, callsPerCluster: 3, gapWithinClusterSeconds: 60 },
    cache: { kind: "off" },
    promptTokens: 2_000,
    completionTokens: 100,
    callsPerSession: 0,
  },
]

const ch = setupTestClickHouse()

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

const scopeOf = (projectId: ProjectId) => ({
  organizationId: ORG_ID,
  projectId,
  from: FROM,
  to: TO,
  previousFrom: PREVIOUS_FROM,
  bucketSeconds: DAY_MS / 1000,
})

const multiplierFor = (
  rows: readonly { factor: SessionCostFactor; multiplier: number }[],
  factor: SessionCostFactor,
): number | undefined => rows.find((row) => row.factor === factor)?.multiplier

const factorsOf = (rows: readonly { factor: SessionCostFactor }[]): SessionCostFactor[] => rows.map((row) => row.factor)

const decompositionFor = async (projectId: ProjectId) =>
  decomposeCostPerSession(await runCh(repo.getSessionCostFactors(scopeOf(projectId))))

let repo: CostAnalyticsRepositoryShape

beforeAll(async () => {
  repo = await Effect.runPromise(
    Effect.gen(function* () {
      return yield* CostAnalyticsRepository
    }).pipe(Effect.provide(CostAnalyticsRepositoryLive)),
  )
})

// The testkit truncates between tests, so the fixtures are re-inserted per test.
beforeEach(async () => {
  await Effect.runPromise(
    insertJsonEachRow(ch.client, "spans", [
      ...spansOf(REGRESSION_COHORTS, BLENDED_PROJECT_ID),
      ...spansOf(cohortsOf("router"), MIX_PROJECT_ID),
      ...spansOf(cohortsOf("context-grader"), PROMPT_PROJECT_ID),
      ...spansOf(PARITY_COHORTS, PARITY_PROJECT_ID),
    ]),
  )
})

describe("getSessionCostFactors", () => {
  it("splits one scan into two adjacent periods of equal shape", async () => {
    const { previous, current } = await runCh(repo.getSessionCostFactors(scopeOf(MIX_PROJECT_ID)))

    // Archetype D's router holds volume flat across the shift and moves only which
    // model serves it, so every count except spend matches period to period.
    expect(current.calls).toBe(previous.calls)
    expect(current.traces).toBe(previous.traces)
    expect(current.sessions).toBe(previous.sessions)
    expect(sessionCostTokens(current)).toBe(sessionCostTokens(previous))
    expect(sessionCostMicrocents(current)).toBeGreaterThan(sessionCostMicrocents(previous))
    // Two models, each split prompt and output.
    expect(current.cells.length).toBe(4)
  })

  it("returns sparkline buckets spanning both windows off the same scan", async () => {
    const { buckets } = await runCh(repo.getSessionCostFactors(scopeOf(MIX_PROJECT_ID)))

    expect(buckets.length).toBeGreaterThan(1)
    const starts = buckets.map((bucket) => bucket.bucketStart.getTime())
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(PREVIOUS_FROM.getTime())
    expect(Math.max(...starts)).toBeLessThan(TO.getTime())
    expect(buckets.every((bucket) => bucket.sessions > 0)).toBe(true)
  })

  it("puts archetype D's traffic shift on model mix and nothing else", async () => {
    const result = await decompositionFor(MIX_PROJECT_ID)

    expect(result.status).toBe("ok")
    expect(factorsOf(result.rows).length).toBe(7)
    expect(result.totalMultiplier).toBeGreaterThan(1)
    expect(multiplierFor(result.rows, "modelMix")).toBeGreaterThan(1)
    // The fixture holds each model's own calls per cluster — and so its write-to-read
    // ratio, and so each side's price per token — fixed across the shift. Nothing is
    // left for the rate rows, and volume never moved, so all of it folds away.
    expect(multiplierFor(result.rows, "promptRate")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "outputRate")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "tokensPerCall")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "tracesPerSession")).toBeCloseTo(1, 2)
  })

  it("puts archetype D's prompt growth on tokens per call and not on model mix", async () => {
    const result = await decompositionFor(PROMPT_PROJECT_ID)

    expect(result.status).toBe("ok")
    expect(result.rows[0]?.factor).toBe("tokensPerCall")
    expect(multiplierFor(result.rows, "tokensPerCall")).toBeGreaterThan(1)
    // One model throughout, so no share between price lists can have moved.
    expect(multiplierFor(result.rows, "modelMix")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "tracesPerSession")).toBeCloseTo(1, 2)
  })

  /**
   * The grader's output holds at 120 tokens while its prompt grows fourfold, so the
   * cheap prompt side takes a larger share and the blended per-token price falls with
   * no price changing. That belongs to token mix; a rate row claiming it would read as
   * "we got a better deal".
   */
  it("charges the grader's blended price fall to token mix, not to a rate row", async () => {
    const result = await decompositionFor(PROMPT_PROJECT_ID)

    expect(multiplierFor(result.rows, "tokenMix")).toBeLessThan(1)
    expect(multiplierFor(result.rows, "promptRate")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "outputRate")).toBeCloseTo(1, 2)
  })

  it("keeps both causes visible, and reconciling, on the project that carries them together", async () => {
    const result = await decompositionFor(BLENDED_PROJECT_ID)

    expect(multiplierFor(result.rows, "modelMix")).toBeGreaterThan(1)
    expect(multiplierFor(result.rows, "tokensPerCall")).toBeGreaterThan(1)
    const closes = result.rows.reduce((product, row) => product * row.multiplier, 1) / (result.totalMultiplier ?? 1)
    expect(closes).toBeCloseTo(1, 9)
  })

  it("prices each side of each model separately, so the mix effects have real prices", async () => {
    const { previous } = await runCh(repo.getSessionCostFactors(scopeOf(MIX_PROJECT_ID)))
    const models = [...new Set(previous.cells.map((cell) => cell.model))].sort()
    const priceOf = (model: string, side: string) => {
      const cell = previous.cells.find((candidate) => candidate.model === model && candidate.side === side)
      return cell ? cell.costMicrocents / cell.tokens : 0
    }

    expect(models).toEqual(["claude-opus-4-5", "gpt-5-mini"])
    // Output costs strictly more per token than prompt on both, which is the whole
    // reason a prompt/output shift must not be read as a rate change.
    for (const model of models) expect(priceOf(model, "output")).toBeGreaterThan(priceOf(model, "prompt"))
    expect(priceOf("claude-opus-4-5", "prompt")).toBeGreaterThan(priceOf("gpt-5-mini", "prompt"))
  })
})

/**
 * The session denominator has to be the key the rollups aggregate on, or a
 * sessionless project reports a different session count on this card than in the
 * sessions list. `00055` had to restate both materialized-view bodies verbatim to
 * add a column, which is exactly where the `coalesce` fallback gets dropped by
 * accident and silently changes every per-session figure.
 */
describe("session denominator parity with the sessions rollup", () => {
  const rollupSessionIds = async (): Promise<readonly string[]> => {
    const result = await ch.client.query({
      query: `SELECT DISTINCT session_id FROM sessions
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}
        ORDER BY session_id`,
      query_params: { organizationId: ORG_ID as string, projectId: PARITY_PROJECT_ID as string },
      format: "JSONEachRow",
    })
    return (await result.json<{ session_id: string }>()).map((row) => row.session_id)
  }

  it("keys spans that reported no session id on their trace id instead of dropping them", async () => {
    const spans = spansOf(PARITY_COHORTS, PARITY_PROJECT_ID)
    const sessionless = spans.filter((span) => span.session_id === "")
    const rollupIds = await rollupSessionIds()

    expect(sessionless.length).toBeGreaterThan(0)
    for (const span of sessionless) expect(rollupIds).toContain(span.trace_id)
  })

  it("counts exactly the sessions the rollup keys on, pseudo-sessions included", async () => {
    const { current } = await runCh(repo.getSessionCostFactors(scopeOf(PARITY_PROJECT_ID)))
    const rollupIds = await rollupSessionIds()

    expect(current.sessions).toBe(rollupIds.length)
    // Every sessionless call is its own single-trace session: 20 clusters x 3 calls.
    expect(current.traceKeyedSessions).toBe(60)
    expect(current.sessions).toBe(60 + 20)
  })

  it("declines to compare a project whose comparison window is empty", async () => {
    const result = await decompositionFor(PARITY_PROJECT_ID)

    expect(result.status).toBe("notEnoughData")
    expect(result.changePct).toBeNull()
    expect(result.rows).toEqual([])
  })
})
