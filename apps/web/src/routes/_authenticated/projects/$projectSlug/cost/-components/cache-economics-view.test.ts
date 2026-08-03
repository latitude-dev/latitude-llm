import type { CacheModelJudgment, CacheState, CacheUrgency } from "@domain/spans"
import { CACHE_CEILING_LIFETIME_SECONDS } from "@domain/spans"
import { describe, expect, it } from "vitest"
import type { CacheModelRecord } from "../../../../../../domains/cost/cost.functions.ts"
import {
  cacheStateIsActionable,
  groupCacheRecommendations,
  parseCacheLifetimeSelection,
  resolveCacheRow,
  sortCacheRowsBySavings,
} from "./cache-economics-view.ts"

const judgment = (overrides: Partial<CacheModelJudgment> = {}): CacheModelJudgment => ({
  cachingOn: false,
  actualRate: 0,
  ceilingRate: 0.8,
  breakEvenRate: 0,
  state: "cacheIt" as CacheState,
  urgency: null as CacheUrgency | null,
  modeledSavingsMicrocents: 1_000_000,
  savingsClearsFloor: true,
  ...overrides,
})

const row = (
  overrides: Partial<CacheModelRecord> & { model: string },
  perLifetime: Partial<Record<number, CacheModelJudgment>> = {},
): CacheModelRecord => ({
  provider: "openai",
  calls: 100,
  inputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  costMicrocents: 1_000,
  unpricedCalls: 0,
  unpricedTokens: 0,
  documented: judgment(),
  documentedLifetimeSeconds: 300,
  byLifetimeSeconds: Object.fromEntries(CACHE_CEILING_LIFETIME_SECONDS.map((s) => [s, perLifetime[s] ?? judgment()])),
  verdictDependsOnLifetime: false,
  ...overrides,
})

const view = (record: CacheModelRecord) => resolveCacheRow(record, "documented")

describe("resolveCacheRow", () => {
  it("reads each row's own documented lifetime under the default selection", () => {
    const resolved = resolveCacheRow(
      row({ model: "a", documented: judgment({ ceilingRate: 0.4 }), documentedLifetimeSeconds: 1_800 }),
      "documented",
    )

    expect(resolved.judgment.ceilingRate).toBe(0.4)
    expect(resolved.lifetimeSeconds).toBe(1_800)
    expect(resolved.isDocumented).toBe(true)
  })

  it("switches to a precomputed judgment when a lifetime is chosen", () => {
    const resolved = resolveCacheRow(
      row({ model: "a" }, { 3600: judgment({ ceilingRate: 0.95, state: "investigate", urgency: "underusing" }) }),
      3_600,
    )

    expect(resolved.judgment.ceilingRate).toBe(0.95)
    expect(resolved.judgment.state).toBe("investigate")
    expect(resolved.lifetimeSeconds).toBe(3_600)
    expect(resolved.isDocumented).toBe(false)
  })

  it("falls back to documented rather than inventing a judgment for an unknown lifetime", () => {
    const resolved = resolveCacheRow(row({ model: "a" }), 999 as number)

    expect(resolved.isDocumented).toBe(true)
    expect(resolved.lifetimeSeconds).toBe(300)
  })
})

describe("parseCacheLifetimeSelection", () => {
  it("accepts the offered lifetimes and rejects anything else", () => {
    expect(parseCacheLifetimeSelection("1800")).toBe(1_800)
    expect(parseCacheLifetimeSelection("documented")).toBe("documented")
    expect(parseCacheLifetimeSelection("999")).toBe("documented")
    expect(parseCacheLifetimeSelection(undefined)).toBe("documented")
  })
})

describe("sortCacheRowsBySavings", () => {
  it("raises the rows worth acting on and sinks the ones with nothing to sort by", () => {
    const sorted = sortCacheRowsBySavings(
      [
        row({ model: "healthy", documented: judgment({ state: "optimal", modeledSavingsMicrocents: null }) }),
        row({ model: "small-win", documented: judgment({ modeledSavingsMicrocents: 5_000 }) }),
        row({ model: "big-win", documented: judgment({ modeledSavingsMicrocents: 900_000 }) }),
        row({ model: "thin", documented: judgment({ state: "notEnoughData", modeledSavingsMicrocents: null }) }),
      ].map(view),
    )

    expect(sorted.map((entry) => entry.model)).toEqual(["big-win", "small-win", "healthy", "thin"])
  })

  it("falls back to spend, so a table with no findings keeps the query's own ranking", () => {
    const sorted = sortCacheRowsBySavings(
      [
        row({
          model: "cheap",
          costMicrocents: 10,
          documented: judgment({ state: "optimal", modeledSavingsMicrocents: null }),
        }),
        row({
          model: "dear",
          costMicrocents: 900,
          documented: judgment({ state: "optimal", modeledSavingsMicrocents: null }),
        }),
      ].map(view),
    )

    expect(sorted.map((entry) => entry.model)).toEqual(["dear", "cheap"])
  })
})

describe("groupCacheRecommendations", () => {
  it("raises one card per actionable state, with each state's savings summed", () => {
    const cards = groupCacheRecommendations([
      row({ model: "off-model", documented: judgment({ state: "cacheIt", modeledSavingsMicrocents: 300 }) }),
      row({ model: "wasteful", documented: judgment({ state: "stopCaching", modeledSavingsMicrocents: 200 }) }),
      row({
        model: "broken-a",
        documented: judgment({ state: "investigate", urgency: "overpaying", modeledSavingsMicrocents: 100 }),
      }),
      row({
        model: "broken-b",
        documented: judgment({ state: "investigate", urgency: "underusing", modeledSavingsMicrocents: 50 }),
      }),
    ])

    expect(cards.map((card) => card.state)).toEqual(["cacheIt", "stopCaching", "investigate"])
    expect(cards[2]?.savingsMicrocents).toBe(150)
    expect(cards[2]?.rows.map((entry) => entry.model)).toEqual(["broken-a", "broken-b"])
  })

  it("raises nothing for a project where every model is already fine", () => {
    const cards = groupCacheRecommendations([
      row({
        model: "healthy",
        documented: judgment({ state: "optimal", modeledSavingsMicrocents: null, savingsClearsFloor: false }),
      }),
      row({
        model: "guardrail",
        documented: judgment({ state: "correctlyOff", modeledSavingsMicrocents: null, savingsClearsFloor: false }),
      }),
    ])

    expect(cards).toEqual([])
  })

  it("leaves a finding in the table but off the cards when the money behind it is noise", () => {
    const records = [
      row({
        model: "pennies",
        documented: judgment({ state: "cacheIt", modeledSavingsMicrocents: 40, savingsClearsFloor: false }),
      }),
    ]

    expect(groupCacheRecommendations(records)).toEqual([])
    expect(sortCacheRowsBySavings(records.map(view))[0]?.judgment.modeledSavingsMicrocents).toBe(40)
  })

  it("ignores a chosen lifetime entirely, so an assumption cannot become a recommendation", () => {
    // Documented says there is nothing to do; an hour would say otherwise. The cards
    // must follow the documented verdict, because a signal will read the same source.
    const cards = groupCacheRecommendations([
      row(
        {
          model: "quiet",
          documented: judgment({ state: "optimal", modeledSavingsMicrocents: null, savingsClearsFloor: false }),
        },
        { 3600: judgment({ state: "investigate", urgency: "underusing", modeledSavingsMicrocents: 9_000_000 }) },
      ),
    ])

    expect(cards).toEqual([])
  })
})

describe("cacheStateIsActionable", () => {
  it("is true for exactly the three states that render a recommendation", () => {
    expect((["cacheIt", "stopCaching", "investigate"] as const).every(cacheStateIsActionable)).toBe(true)
    expect((["optimal", "correctlyOff", "notEnoughData"] as const).some(cacheStateIsActionable)).toBe(false)
  })
})
