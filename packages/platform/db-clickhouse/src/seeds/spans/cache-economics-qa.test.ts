import { createSeedScope, SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { type CacheState, classifyCacheState, modelCacheBreakEvenRate } from "@domain/spans"
import { cacheHitRate } from "@repo/utils"
import { describe, expect, it } from "vitest"
import { buildCacheEconomicsQaFixture, CACHE_QA_COHORTS } from "./cache-economics-qa.ts"

const scope = createSeedScope({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
  timelineAnchor: new Date("2026-06-16T12:00:00.000Z"),
  apiKeyId: SEED_API_KEY_ID,
})

const NOW_MS = Date.parse("2026-06-16T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

const spans = buildCacheEconomicsQaFixture(scope, NOW_MS)

/** The panel's own reading of the fixture: aggregate per model, then classify. */
const stateFor = (model: string): { state: CacheState; breakEven: number | null; actual: number | null } => {
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

describe("cache economics QA fixture", () => {
  it("assigns deterministic trace and span ids, which is what the idempotency sentinel keys on", () => {
    const rebuilt = buildCacheEconomicsQaFixture(scope, NOW_MS)
    expect(rebuilt.map((span) => span.span_id)).toEqual(spans.map((span) => span.span_id))
    expect(rebuilt.map((span) => span.trace_id)).toEqual(spans.map((span) => span.trace_id))
    expect(new Set(spans.map((span) => span.span_id)).size).toBe(spans.length)
  })

  it("carves cache reads and writes out of the prompt so the token columns stay additive", () => {
    for (const cohort of CACHE_QA_COHORTS) {
      const call = spans.find((span) => span.model === cohort.modelConfig.model)
      expect(call).toBeDefined()
      const total = (call?.tokens_input ?? 0) + (call?.tokens_cache_read ?? 0) + (call?.tokens_cache_create ?? 0)
      expect(total).toBe(cohort.promptTokens)
    }
  })

  it("lands every call inside the trailing week the cost page defaults to", () => {
    const oldest = Math.min(...spans.map((span) => Date.parse(`${span.start_time.replace(" ", "T")}Z`)))
    expect(NOW_MS - oldest).toBeLessThan(7 * DAY_MS)
  })

  it("uses models the ambient generator never emits, so no row blends two cache stories", () => {
    const ambient = new Set(["gpt-4o", "gpt-4o-mini", "o3-mini", "claude-sonnet-4-6", "claude-3-5-haiku", "gpt-4.1"])
    for (const cohort of CACHE_QA_COHORTS) expect(ambient.has(cohort.modelConfig.model)).toBe(false)
  })

  it("prices every cohort against a model the registry knows", () => {
    for (const cohort of CACHE_QA_COHORTS) {
      expect(
        modelCacheBreakEvenRate({ provider: cohort.modelConfig.provider, model: cohort.modelConfig.model }),
      ).not.toBeNull()
    }
  })

  it("puts an Anthropic-style break-even beside a no-premium one, so the difference is visible", () => {
    expect(stateFor("claude-opus-4-5").breakEven).toBeCloseTo(0.2174, 4)
    expect(stateFor("gpt-5-mini").breakEven).toBe(0)
    // Same provider, different price list: break-even is a per-model property.
    expect(stateFor("gpt-5.6").breakEven).toBeCloseTo(0.2174, 4)
  })

  it("reaches every state the classifier can decide without an achievable ceiling", () => {
    expect(stateFor("claude-opus-4-5").state).toBe("optimal")
    expect(stateFor("claude-haiku-4-5").state).toBe("investigate")
    expect(stateFor("gpt-5-mini").state).toBe("cacheIt")
    expect(stateFor("gpt-5.6").state).toBe("investigate")
    expect(stateFor("gemini-2.5-flash-lite").state).toBe("notEnoughData")
  })

  it("shows the same rate reading as fine on one model and broken on another", () => {
    const noPremium = stateFor("gpt-5.4-mini")
    const withPremium = stateFor("claude-haiku-4-5")
    expect(noPremium.actual).toBeLessThan(0.2174)
    expect(withPremium.actual).toBeLessThan(0.2174)
    expect(noPremium.state).toBe("optimal")
    expect(withPremium.state).toBe("investigate")
  })

  it("records no cache tokens at all for the caching-off cohort", () => {
    const off = spans.filter((span) => span.model === "gpt-5-mini")
    expect(off.every((span) => span.tokens_cache_read === 0 && span.tokens_cache_create === 0)).toBe(true)
  })

  it("gives each cohort its own call cadence", () => {
    expect(new Set(CACHE_QA_COHORTS.map((cohort) => cohort.gapMinutes)).size).toBe(CACHE_QA_COHORTS.length)
  })
})
