import type { ProjectId } from "@domain/shared/seeding"
import {
  createSeedScope,
  SEED_API_KEY_ID,
  SEED_COST_ARCHETYPE_PROJECTS,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
} from "@domain/shared/seeding"
import { type CacheState, classifyCacheState, modelCacheBreakEvenRate, modelRegistryPricing } from "@domain/spans"
import { cacheHitRate } from "@repo/utils"
import { describe, expect, it } from "vitest"
import type { SpanRow } from "../span-builders.ts"
import { buildCohortsSpans, type CostCohort, cohortCalls, cohortClusterDurationMs, HOUR_MS } from "./cohorts.ts"
import { FINDINGS_FIRE_COHORTS } from "./findings-fire.ts"
import { FREE_COHORTS } from "./free.ts"
import { HEALTHY_COHORTS } from "./healthy.ts"
import { REGRESSION_COHORTS } from "./regression.ts"
import { SINGLE_TURN_COHORTS } from "./single-turn.ts"
import { TINY_COHORTS } from "./tiny.ts"

const ANCHOR_ISO = "2026-06-16T12:00:00.000Z"
const ANCHOR_MS = Date.parse(ANCHOR_ISO)
const DAY_MS = 24 * 60 * 60 * 1000

const scopeFor = (projectId: ProjectId) =>
  createSeedScope({
    organizationId: SEED_ORG_ID,
    projectId,
    timelineAnchor: new Date(ANCHOR_ISO),
    apiKeyId: SEED_API_KEY_ID,
  })

const ARCHETYPES = [
  { key: "A healthy", cohorts: HEALTHY_COHORTS, projectId: SEED_COST_ARCHETYPE_PROJECTS.healthy.id },
  { key: "B findings fire", cohorts: FINDINGS_FIRE_COHORTS, projectId: SEED_PROJECT_ID },
  { key: "C single turn", cohorts: SINGLE_TURN_COHORTS, projectId: SEED_COST_ARCHETYPE_PROJECTS.singleTurn.id },
  { key: "D regression", cohorts: REGRESSION_COHORTS, projectId: SEED_COST_ARCHETYPE_PROJECTS.regression.id },
  { key: "E tiny", cohorts: TINY_COHORTS, projectId: SEED_COST_ARCHETYPE_PROJECTS.tiny.id },
  { key: "F free", cohorts: FREE_COHORTS, projectId: SEED_COST_ARCHETYPE_PROJECTS.free.id },
] as const

const spansOf = (cohorts: readonly CostCohort[], projectId: ProjectId): SpanRow[] =>
  buildCohortsSpans(cohorts, scopeFor(projectId), ANCHOR_MS)

const startMsOf = (span: SpanRow): number => Date.parse(`${span.start_time.replace(" ", "T")}Z`)

const spendOf = (rows: readonly SpanRow[]): number => rows.reduce((sum, span) => sum + span.cost_total_microcents, 0)

const promptOf = (span: SpanRow | undefined): number =>
  (span?.tokens_input ?? 0) + (span?.tokens_cache_read ?? 0) + (span?.tokens_cache_create ?? 0)

const findingsSpans = spansOf(FINDINGS_FIRE_COHORTS, SEED_PROJECT_ID)

/** The panel's own reading of a fixture: aggregate per model, then classify. */
const stateFor = (
  spans: readonly SpanRow[],
  model: string,
): { state: CacheState; breakEven: number | null; actual: number | null } => {
  const rows = spans.filter((span) => span.model === model)
  const totals = rows.reduce(
    (sum, span) => ({
      input: sum.input + span.tokens_input,
      cacheRead: sum.cacheRead + span.tokens_cache_read,
      cacheCreate: sum.cacheCreate + span.tokens_cache_create,
    }),
    { input: 0, cacheRead: 0, cacheCreate: 0 },
  )
  const provider = rows[0]?.provider ?? ""
  const breakEven = modelCacheBreakEvenRate({ provider, model })
  const actual = cacheHitRate(totals)
  return {
    breakEven,
    actual,
    state: classifyCacheState({
      cachingOn: totals.cacheRead + totals.cacheCreate > 0,
      actualRate: actual,
      ceilingRate: null,
      breakEvenRate: breakEven,
      calls: rows.length,
      avgInputTokensPerCall: rows.length > 0 ? (totals.input + totals.cacheRead + totals.cacheCreate) / rows.length : 0,
    }).state,
  }
}

/**
 * The ceiling LAT-798 will compute, read off the cadence the way its spec defines it:
 * the share of cache-eligible volume whose gap to the previous call — across the
 * agent's whole traffic, not within a session — falls inside the TTL. The cluster
 * layout makes that exactly `(n - 1) / n`, since every within-cluster gap is well
 * under any plausible TTL and every between-cluster gap is well over it.
 */
const expectedCeiling = (cohort: CostCohort): number =>
  (cohort.cadence.callsPerCluster - 1) / cohort.cadence.callsPerCluster

const cohortByKey = (cohorts: readonly CostCohort[], key: string): CostCohort => {
  const cohort = cohorts.find((candidate) => candidate.key === key)
  if (!cohort) throw new Error(`no cohort ${key}`)
  return cohort
}

describe("cost archetype fixtures", () => {
  it.each(ARCHETYPES)("$key builds deterministically with unique span ids", ({ cohorts, projectId }) => {
    const spans = spansOf(cohorts, projectId)
    const rebuilt = spansOf(cohorts, projectId)
    expect(rebuilt.map((span) => span.span_id)).toEqual(spans.map((span) => span.span_id))
    expect(rebuilt.map((span) => span.trace_id)).toEqual(spans.map((span) => span.trace_id))
    expect(new Set(spans.map((span) => span.span_id)).size).toBe(spans.length)
  })

  it.each(ARCHETYPES)("$key keeps the input-side token columns additive", ({ cohorts, projectId }) => {
    const spans = spansOf(cohorts, projectId)
    let index = 0
    for (const cohort of cohorts) {
      for (let call = 0; call < cohortCalls(cohort); call++) {
        expect(promptOf(spans[index++])).toBe(cohort.promptTokens)
      }
    }
  })

  it.each(ARCHETYPES)("$key writes nothing after the anchor", ({ cohorts, projectId }) => {
    for (const span of spansOf(cohorts, projectId)) expect(startMsOf(span)).toBeLessThanOrEqual(ANCHOR_MS)
  })

  it.each(ARCHETYPES)("$key keeps each cluster shorter than the gap to the next one", ({ cohorts }) => {
    for (const cohort of cohorts) {
      expect(cohortClusterDurationMs(cohort.cadence)).toBeLessThan(cohort.cadence.clusterSpacingHours * HOUR_MS)
    }
  })

  it("names only models the registry still prices, so no cohort is accidentally unpriced", () => {
    // Costs come from the registry, so a stale or invented model id silently produces
    // `unpriced` rows. Exactly one cohort is meant to — the gateway model archetype B
    // uses to seed the missing-cost bucket.
    const unpriced = ARCHETYPES.flatMap(({ cohorts }) => cohorts).filter(
      (cohort) =>
        modelRegistryPricing({ provider: cohort.modelConfig.provider, model: cohort.modelConfig.model }) === null,
    )
    expect(unpriced.map((cohort) => cohort.key)).toEqual(["b-unpriced"])
  })
})

describe("archetype A — healthy at scale", () => {
  const spans = spansOf(HEALTHY_COHORTS, SEED_COST_ARCHETYPE_PROJECTS.healthy.id)

  it("shows no finding on any model, which is the entire point of the fixture", () => {
    for (const cohort of HEALTHY_COHORTS) expect(stateFor(spans, cohort.modelConfig.model).state).toBe("optimal")
  })

  it("uses only three models, all priced, over 60-90 days of history", () => {
    expect(new Set(spans.map((span) => span.model)).size).toBe(3)
    expect(spans.every((span) => span.cost_total_microcents > 0)).toBe(true)
    const oldestDays = (ANCHOR_MS - Math.min(...spans.map(startMsOf))) / DAY_MS
    expect(oldestDays).toBeGreaterThanOrEqual(60)
    expect(oldestDays).toBeLessThanOrEqual(90)
  })

  it("stays close enough to its ceiling that a workable tolerance absorbs the gap", () => {
    for (const cohort of HEALTHY_COHORTS) {
      const actual = stateFor(spans, cohort.modelConfig.model).actual ?? 0
      expect(actual).toBeLessThan(expectedCeiling(cohort))
      expect(expectedCeiling(cohort) - actual).toBeLessThan(0.1)
    }
  })

  it("gives provider-reported cost a home, so the verified share is not always zero", () => {
    const reported = spans.filter((span) => span.cost_source === "provider_reported")
    expect(reported.length).toBeGreaterThan(0)
    expect(reported.every((span) => span.cost_is_estimated === 0 && span.cost_total_microcents > 0)).toBe(true)
  })

  it("is multi-turn throughout", () => {
    for (const cohort of HEALTHY_COHORTS) expect(cohort.callsPerSession).toBeGreaterThan(1)
  })
})

describe("archetype B — the project where findings fire", () => {
  it("puts an Anthropic-style break-even beside a no-premium one, so the difference is visible", () => {
    expect(stateFor(findingsSpans, "claude-opus-4-5").breakEven).toBeCloseTo(0.2174, 4)
    expect(stateFor(findingsSpans, "gpt-5-mini").breakEven).toBe(0)
    // Same provider, different price list: break-even is a per-model property.
    expect(stateFor(findingsSpans, "gpt-5.6").breakEven).toBeCloseTo(0.2174, 4)
  })

  it("reaches every state the classifier can decide without an achievable ceiling", () => {
    expect(stateFor(findingsSpans, "claude-opus-4-5").state).toBe("optimal")
    expect(stateFor(findingsSpans, "claude-haiku-4-5").state).toBe("investigate")
    expect(stateFor(findingsSpans, "gpt-5-mini").state).toBe("cacheIt")
    expect(stateFor(findingsSpans, "gpt-5-nano").state).toBe("correctlyOff")
    expect(stateFor(findingsSpans, "gemini-2.5-flash-lite").state).toBe("notEnoughData")
  })

  it("shapes the two states that stay dark until the achievable ceiling ships", () => {
    // Isolated calls, so no write is ever read back before it expires: `stopCaching`
    // once a ceiling below break-even can be asserted. Today the classifier can only
    // say the weaker thing that holds for every possible ceiling.
    const stopCaching = stateFor(findingsSpans, "gpt-5.6")
    expect(stopCaching.actual).toBeLessThan(stopCaching.breakEven ?? 1)
    expect(stopCaching.state).toBe("investigate")
    expect(expectedCeiling(cohortByKey(FINDINGS_FIRE_COHORTS, "b-stop-caching"))).toBe(0)

    // Clears its 0% break-even but sits far below what the cadence supports:
    // `investigate / underusing` once ceilings arrive, `optimal` until then.
    const underusing = stateFor(findingsSpans, "gpt-5.4-mini")
    expect(underusing.state).toBe("optimal")
    const ceiling = expectedCeiling(cohortByKey(FINDINGS_FIRE_COHORTS, "b-underusing"))
    expect(underusing.actual ?? 0).toBeLessThan(ceiling - 0.2)
  })

  it("shows the same rate reading as fine on one model and broken on another", () => {
    const noPremium = stateFor(findingsSpans, "gpt-5.4-mini")
    const withPremium = stateFor(findingsSpans, "claude-haiku-4-5")
    expect(noPremium.actual).toBeLessThan(0.2174)
    expect(withPremium.actual).toBeLessThan(0.2174)
    expect(noPremium.state).toBe("optimal")
    expect(withPremium.state).toBe("investigate")
  })

  it("records no cache tokens at all for a caching-off cohort", () => {
    const off = findingsSpans.filter((span) => span.model === "gpt-5-mini")
    expect(off.length).toBeGreaterThan(0)
    expect(off.every((span) => span.tokens_cache_read === 0 && span.tokens_cache_create === 0)).toBe(true)
  })

  it("carries both zero-cost buckets, so coverage reads 'at least N%'", () => {
    const unpriced = findingsSpans.filter((span) => span.cost_source === "unpriced")
    const legacy = findingsSpans.filter((span) => span.cost_source === "")
    expect(unpriced.length).toBeGreaterThan(0)
    expect(legacy.length).toBeGreaterThan(0)
    for (const span of [...unpriced, ...legacy]) {
      expect(span.cost_total_microcents).toBe(0)
      expect(span.tokens_input + span.tokens_output).toBeGreaterThan(0)
    }
  })

  it("mixes sessioned and sessionless traffic", () => {
    expect(findingsSpans.some((span) => span.session_id === "")).toBe(true)
    expect(findingsSpans.some((span) => span.session_id !== "")).toBe(true)
  })

  it("carries a long tail of one-off models for top-N + Other to collapse", () => {
    const callsByModel = new Map<string, number>()
    for (const span of findingsSpans) callsByModel.set(span.model, (callsByModel.get(span.model) ?? 0) + 1)
    expect([...callsByModel.values()].filter((calls) => calls <= 3).length).toBeGreaterThanOrEqual(8)
    expect(callsByModel.size).toBeGreaterThan(6)
  })

  it("gives no two cohorts the same model, so no row blends two cache stories", () => {
    const models = FINDINGS_FIRE_COHORTS.map((cohort) => cohort.modelConfig.model)
    expect(new Set(models).size).toBe(models.length)
  })

  it("uses models the ambient generator never emits", () => {
    const ambient = new Set([
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
      "claude-sonnet-4-6",
      "claude-sonnet-5",
      "deepseek-chat",
      "gemini-2.0-flash",
      "gpt-4.1",
    ])
    for (const cohort of FINDINGS_FIRE_COHORTS) expect(ambient.has(cohort.modelConfig.model)).toBe(false)
  })
})

describe("archetype C — single-turn high volume", () => {
  const spans = spansOf(SINGLE_TURN_COHORTS, SEED_COST_ARCHETYPE_PROJECTS.singleTurn.id)

  it("gives every session exactly one turn", () => {
    const callsBySession = new Map<string, number>()
    for (const span of spans) callsBySession.set(span.session_id, (callsBySession.get(span.session_id) ?? 0) + 1)
    expect(callsBySession.size).toBe(spans.length)
    expect([...callsBySession.values()].every((calls) => calls === 1)).toBe(true)
  })

  it("still has an excellent ceiling — the one fixture that separates a correct ceiling from a within-session one", () => {
    for (const cohort of SINGLE_TURN_COHORTS) {
      // A within-session reading sees nothing but first calls here, so it would score
      // this project at 0% and call the ideal caching case unfixable.
      expect(expectedCeiling(cohort)).toBeGreaterThan(0.9)
      expect(cohort.cadence.gapWithinClusterSeconds).toBeLessThanOrEqual(150)
      expect(cohort.callsPerSession).toBe(1)
    }
  })

  it("shares one system prompt per agent, so the ceiling's prefix assumption holds", () => {
    for (const cohort of SINGLE_TURN_COHORTS) {
      const agentSpans = spans.filter((span) => span.service_name === cohort.serviceName)
      expect(agentSpans.length).toBe(cohortCalls(cohort))
      expect(new Set(agentSpans.map((span) => span.system_instructions)).size).toBe(1)
    }
  })
})

describe("archetype D — spend regression", () => {
  const spans = spansOf(REGRESSION_COHORTS, SEED_COST_ARCHETYPE_PROJECTS.regression.id)
  // Between the newest before-period call (28d) and the oldest after-period one (27d).
  const splitMs = ANCHOR_MS - 27.5 * DAY_MS

  const forAgent = (agent: string) => {
    const rows = spans.filter((span) => span.service_name === agent)
    return {
      before: rows.filter((span) => startMsOf(span) < splitMs),
      after: rows.filter((span) => startMsOf(span) >= splitMs),
    }
  }

  it("gives both periods real volume, which period-over-period contribution needs", () => {
    for (const agent of ["router", "context-grader"]) {
      const { before, after } = forAgent(agent)
      expect(before.length).toBeGreaterThan(0)
      expect(after.length).toBeGreaterThan(0)
    }
  })

  it("attributes the router's rise to model mix, with tokens per call held flat", () => {
    const { before, after } = forAgent("router")
    expect(spendOf(after)).toBeGreaterThan(spendOf(before) * 2)

    const premiumShare = (rows: readonly SpanRow[]) =>
      rows.filter((span) => span.provider === "anthropic").length / rows.length
    expect(premiumShare(before)).toBeLessThan(0.15)
    expect(premiumShare(after)).toBeGreaterThan(0.55)
    expect(new Set(before.map(promptOf))).toEqual(new Set(after.map(promptOf)))
  })

  it("attributes the grader's rise to prompt growth, with model and turns held flat", () => {
    const { before, after } = forAgent("context-grader")
    expect(spendOf(after)).toBeGreaterThan(spendOf(before) * 2)
    expect(new Set([...before, ...after].map((span) => span.model)).size).toBe(1)
    expect(before.length).toBe(after.length)
    expect(promptOf(after[0])).toBe(promptOf(before[0]) * 4)
  })
})

describe("archetype E — tiny and new", () => {
  const spans = spansOf(TINY_COHORTS, SEED_COST_ARCHETYPE_PROJECTS.tiny.id)

  it("stays under every sample floor", () => {
    expect(spans.length).toBeLessThan(20)
    expect(stateFor(spans, "gemini-2.5-flash-lite").state).toBe("notEnoughData")
  })

  it("reaches the anchor, so the window's last day is always still in progress", () => {
    expect(Math.max(...spans.map(startMsOf))).toBe(ANCHOR_MS)
  })
})

describe("archetype F — genuinely free", () => {
  const spans = spansOf(FREE_COHORTS, SEED_COST_ARCHETYPE_PROJECTS.free.id)

  it("totals $0 while every call is priced and estimated, not unpriced", () => {
    expect(spans.length).toBeGreaterThan(0)
    expect(spendOf(spans)).toBe(0)
    expect(spans.every((span) => span.cost_source === "estimated")).toBe(true)
    expect(spans.every((span) => span.tokens_input + span.tokens_output > 0)).toBe(true)
  })

  it("is free because the registry prices it at zero, not because the fixture zeroed it", () => {
    for (const cohort of FREE_COHORTS) {
      const pricing = modelRegistryPricing({
        provider: cohort.modelConfig.provider,
        model: cohort.modelConfig.model,
      })
      expect(pricing, cohort.key).not.toBeNull()
      expect(pricing?.input).toBe(0)
      expect(pricing?.output).toBe(0)
    }
  })
})
