import { createSeedScope, SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import type { CacheEconomics } from "@domain/spans"
import {
  CACHE_CEILING_LIFETIME_SECONDS,
  cacheCeilingRate,
  classifyCacheState,
  judgeCacheEconomics,
  modelCacheBreakEvenRate,
} from "@domain/spans"
import { describe, expect, it } from "vitest"
import type { SpanRow } from "../span-builders.ts"
import type { CostCohort } from "./cohorts.ts"
import { buildCohortsSpans, cohortCalls } from "./cohorts.ts"
import { FINDINGS_FIRE_COHORTS } from "./findings-fire.ts"
import { HEALTHY_COHORTS } from "./healthy.ts"
import { SINGLE_TURN_COHORTS } from "./single-turn.ts"

/**
 * Whether the seed set can actually exercise the cache panel — the three recommendation
 * states and the lifetime control.
 *
 * This exists because the set silently lost that ability once already: every cohort's
 * within-cluster gap was under four minutes and every between-cluster gap over two
 * hours, so the ceiling was identical at 5 minutes, 30 minutes and an hour, and the
 * lifetime control would have moved nothing across the whole range real lifetimes live
 * in. Nothing failed, because no test asked.
 */

/** Ceiling read off the cluster layout, the way the repository's histogram measures it. */
const ceilingAt = (cohort: CostCohort, lifetimeSeconds: number): number | null => {
  const { callsPerCluster, gapWithinClusterSeconds, clusterSpacingHours, clusters } = cohort.cadence
  const withinWarm = callsPerCluster > 1 && gapWithinClusterSeconds <= lifetimeSeconds
  const betweenWarm = clusterSpacingHours * 3_600 <= lifetimeSeconds
  const warmPerCluster = (withinWarm ? callsPerCluster - 1 : 0) + (betweenWarm ? 1 : 0)
  const warm = Math.max(0, clusters * warmPerCluster - (betweenWarm ? 1 : 0))
  return cacheCeilingRate({ cacheableTokens: clusters * callsPerCluster, warmTokens: warm })
}

const actualRate = (cohort: CostCohort): number => {
  const { cache, cadence } = cohort
  if (cache.kind === "off") return 0
  if (cache.kind === "flat") return cache.profile.hitRate
  return (cache.share * (cadence.callsPerCluster - 1)) / cadence.callsPerCluster
}

const stateAt = (cohort: CostCohort, lifetimeSeconds: number) =>
  classifyCacheState({
    cachingOn: cohort.cache.kind !== "off",
    actualRate: actualRate(cohort),
    ceilingRate: ceilingAt(cohort, lifetimeSeconds),
    breakEvenRate: modelCacheBreakEvenRate({
      provider: cohort.modelConfig.provider,
      model: cohort.modelConfig.model,
    }),
    calls: cohortCalls(cohort),
    avgInputTokensPerCall: cohort.promptTokens,
  }).state

describe("seed coverage for the lifetime control", () => {
  it("has a cohort whose verdict turns on a lifetime between five minutes and an hour", () => {
    // The range every documented lifetime falls in, and the one the old set could not
    // distinguish at all. Extremes do not count: a cohort that only moves at 24 hours
    // proves nothing about the lifetimes anyone actually runs on.
    const realistic = [300, 1_800, 3_600]
    const movers = FINDINGS_FIRE_COHORTS.filter(
      (cohort) => new Set(realistic.map((lifetimeSeconds) => stateAt(cohort, lifetimeSeconds))).size > 1,
    )

    expect(movers.map((cohort) => cohort.key)).toEqual(expect.arrayContaining(["b-ttl-sensitive", "b-opted-into-hour"]))
  })

  it("moves `b-ttl-sensitive` between the two lifetimes OpenAI documents", () => {
    const cohort = FINDINGS_FIRE_COHORTS.find((entry) => entry.key === "b-ttl-sensitive")
    if (!cohort) throw new Error("no b-ttl-sensitive cohort")

    // Ten-minute gaps: nothing warm at the older models' 5 minutes, all warm at 5.6's 30.
    expect(ceilingAt(cohort, 300)).toBe(0)
    expect(ceilingAt(cohort, 1_800)).toBeCloseTo(5 / 6, 3)
    expect(stateAt(cohort, 300)).toBe("stopCaching")
    expect(stateAt(cohort, 1_800)).toBe("investigate")
  })

  it("moves `b-opted-into-hour` only at an hour, which is the Anthropic opt-in shape", () => {
    const cohort = FINDINGS_FIRE_COHORTS.find((entry) => entry.key === "b-opted-into-hour")
    if (!cohort) throw new Error("no b-opted-into-hour cohort")

    expect(ceilingAt(cohort, 1_800)).toBe(0)
    expect(ceilingAt(cohort, 3_600)).toBeCloseTo(4 / 5, 3)
    expect(stateAt(cohort, 1_800)).toBe("stopCaching")
    expect(stateAt(cohort, 3_600)).toBe("investigate")
  })

  it("leaves the healthy and single-turn archetypes insensitive to the lifetime", () => {
    // Their gaps are seconds, so every candidate lifetime agrees. A fixture that exists
    // to prove the panel stays quiet must not start moving when someone opens a dropdown.
    for (const cohort of [...HEALTHY_COHORTS, ...SINGLE_TURN_COHORTS]) {
      const realistic = new Set([300, 1_800, 3_600].map((lifetimeSeconds) => stateAt(cohort, lifetimeSeconds)))
      expect(realistic.size).toBe(1)
    }
  })
})

describe("seed coverage for the recommendation cards", () => {
  it("reaches all three actionable states at documented lifetimes, one cohort each", () => {
    // A state with no cohort demonstrates only half the panel: the table row exists but
    // the card it is supposed to raise never renders.
    const byState = new Map<string, string[]>()
    for (const cohort of FINDINGS_FIRE_COHORTS) {
      const documented =
        cohort.modelConfig.provider === "openai" && cohort.modelConfig.model.startsWith("gpt-5.6") ? 1_800 : 300
      const state = stateAt(cohort, documented)
      byState.set(state, [...(byState.get(state) ?? []), cohort.key])
    }

    expect(byState.get("cacheIt")).toContain("b-cache-it")
    expect(byState.get("stopCaching")).toContain("b-stop-caching")
    expect(byState.get("investigate")).toContain("b-investigate-overpaying")
    expect(byState.get("optimal")).toContain("b-optimal")
    expect(byState.get("correctlyOff")).toContain("b-correctly-off")
    expect(byState.get("notEnoughData")).toContain("b-not-enough-data")
  })

  it("carries both cached and uncached traffic, so the panel is not all one shape", () => {
    const kinds = new Set(FINDINGS_FIRE_COHORTS.map((cohort) => cohort.cache.kind))
    expect(kinds).toContain("off")
    expect(kinds).toContain("flat")
    expect(kinds).toContain("prefixReuse")
  })

  it("spans every break-even shape, so a blended project figure is visibly meaningless", () => {
    const breakEvens = new Set(
      FINDINGS_FIRE_COHORTS.map((cohort) =>
        modelCacheBreakEvenRate({ provider: cohort.modelConfig.provider, model: cohort.modelConfig.model }),
      ),
    )
    // A write premium, no premium, and a model the registry cannot price at all.
    expect([...breakEvens].some((rate) => rate !== null && rate > 0.2)).toBe(true)
    expect(breakEvens.has(0)).toBe(true)
    expect(breakEvens.has(null)).toBe(true)
  })
})

const ANCHOR = new Date("2026-08-03T12:00:00.000Z")
const COST_PAGE_WINDOW_DAYS = 30
const startMsOf = (span: SpanRow): number => Date.parse(`${span.start_time.replace(" ", "T")}Z`)

/**
 * Archetype B read the way the repository reads it: measures per provider/model, plus a
 * cumulative gap histogram partitioned by agent, then judged through the same pure
 * function the dashboard calls.
 *
 * This is the end-to-end check that the fixture can actually demonstrate the panel. The
 * six states are reachable on paper without any of the cards rendering, because a card
 * additionally has to clear the weekly spend floor — and on the previous fixture sizes
 * none of the three did.
 */
const judgeArchetypeB = () => {
  const scope = createSeedScope({
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    timelineAnchor: ANCHOR,
    apiKeyId: SEED_API_KEY_ID,
  })
  const spans = buildCohortsSpans(FINDINGS_FIRE_COHORTS, scope, ANCHOR.getTime())

  const measures = new Map<
    string,
    { provider: string; model: string; calls: number; input: number; read: number; create: number; cost: number }
  >()
  const byAgent = new Map<string, { startMs: number; tokens: number; pair: string }[]>()
  for (const span of spans) {
    const pair = `${span.provider} ${span.model}`
    const entry = measures.get(pair) ?? {
      provider: span.provider,
      model: span.model,
      calls: 0,
      input: 0,
      read: 0,
      create: 0,
      cost: 0,
    }
    entry.calls += 1
    entry.input += span.tokens_input
    entry.read += span.tokens_cache_read
    entry.create += span.tokens_cache_create
    entry.cost += span.cost_total_microcents
    measures.set(pair, entry)

    const agentKey = `${span.agent_name || span.service_name} ${pair}`
    const calls = byAgent.get(agentKey) ?? []
    calls.push({
      startMs: startMsOf(span),
      tokens: span.tokens_input + span.tokens_cache_read + span.tokens_cache_create,
      pair,
    })
    byAgent.set(agentKey, calls)
  }

  const histograms = new Map<string, { cacheableTokens: number; warm: Record<number, number> }>()
  for (const calls of byAgent.values()) {
    const ordered = [...calls].sort((a, b) => a.startMs - b.startMs)
    ordered.forEach((call, index) => {
      const pair = call.pair
      const h = histograms.get(pair) ?? {
        cacheableTokens: 0,
        warm: Object.fromEntries(CACHE_CEILING_LIFETIME_SECONDS.map((l) => [l, 0])),
      }
      h.cacheableTokens += call.tokens
      const previous = ordered[index - 1]
      if (previous) {
        const gapSeconds = (call.startMs - previous.startMs) / 1000
        for (const lifetime of CACHE_CEILING_LIFETIME_SECONDS)
          if (gapSeconds <= lifetime) h.warm[lifetime] += call.tokens
      }
      histograms.set(pair, h)
    })
  }

  const economics: CacheEconomics = {
    rows: [...measures.values()].map((m) => ({
      provider: m.provider,
      model: m.model,
      calls: m.calls,
      inputTokens: m.input,
      cacheReadTokens: m.read,
      cacheCreateTokens: m.create,
      costMicrocents: m.cost,
      unpricedCalls: 0,
      unpricedTokens: 0,
    })),
    cadence: [...histograms.entries()].map(([pair, h]) => {
      const [provider, model] = pair.split(" ")
      return {
        provider: provider ?? "",
        model: model ?? "",
        cacheableTokens: h.cacheableTokens,
        calls: 0,
        warmTokensByLifetime: h.warm,
        warmCallsByLifetime: Object.fromEntries(CACHE_CEILING_LIFETIME_SECONDS.map((l) => [l, 0])),
      }
    }),
    totals: {
      calls: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      costMicrocents: 0,
      unpricedCalls: 0,
      unpricedTokens: 0,
      distinctModels: measures.size,
    },
  }

  // The window the cost page actually judges against: on All time it uses the shared
  // trend range, which is clamped to the project's default window rather than reaching
  // back to the first trace. Sizing a card against the fixture's own span instead would
  // pass here and still render nothing on the page, which is how this regressed once.
  return judgeCacheEconomics({ economics, windowMs: COST_PAGE_WINDOW_DAYS * 86_400_000 })
}

describe("archetype B end to end", () => {
  const judged = judgeArchetypeB()
  const byModel = (model: string) => judged.find((row) => row.model === model)

  it("renders all three recommendation cards, which needs savings over the weekly floor", () => {
    // The states being reachable is not enough: a card also has to clear the spend floor,
    // and on the earlier fixture sizes none of the three did.
    for (const [model, state] of [
      ["gpt-5-mini", "cacheIt"],
      ["gpt-5.6", "stopCaching"],
      ["claude-haiku-4-5", "investigate"],
    ] as const) {
      const row = byModel(model)
      expect(row?.documented.state, model).toBe(state)
      expect(row?.documented.modeledSavingsMicrocents ?? 0, model).toBeGreaterThan(0)
      expect(row?.documented.savingsClearsFloor, model).toBe(true)
    }
  })

  it("leaves the healthy rows blank, so the sort sinks them without a filter", () => {
    for (const model of ["claude-opus-4-5", "gpt-5-nano", "gemini-2.5-flash-lite"]) {
      expect(byModel(model)?.documented.savingsClearsFloor, model).toBe(false)
      expect(byModel(model)?.documented.modeledSavingsMicrocents, model).toBeNull()
    }
  })

  it("flags exactly the cohorts whose verdict depends on the assumed lifetime", () => {
    expect(byModel("gpt-5.6-luna")?.verdictDependsOnLifetime).toBe(true)
    expect(byModel("claude-opus-4-6")?.verdictDependsOnLifetime).toBe(true)
    expect(byModel("claude-opus-4-5")?.verdictDependsOnLifetime).toBe(false)
  })

  it("gives the unpriced model no verdict rather than a wrong one", () => {
    expect(byModel("acme-router-v3")?.documented.state).toBe("notEnoughData")
    expect(byModel("acme-router-v3")?.documented.breakEvenRate).toBeNull()
  })
})
