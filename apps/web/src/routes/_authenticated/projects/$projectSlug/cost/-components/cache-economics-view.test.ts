import type { CacheModelJudgment, CacheState, CacheUrgency } from "@domain/spans"
import { CACHE_CEILING_LIFETIME_SECONDS } from "@domain/spans"
import { describe, expect, it } from "vitest"
import type { CacheModelRecord } from "../../../../../../domains/cost/cost.functions.ts"
import {
  buildCacheStateGroups,
  cacheStateIsActionable,
  parseCacheLifetimeSelection,
  recoverableShare,
  resolveCacheRow,
  sortCacheRowsBySavings,
  summariseSettledRows,
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

describe("buildCacheStateGroups", () => {
  it("leads with the states that ask for something, by how much they would save", () => {
    const groups = buildCacheStateGroups(
      [
        row({ model: "off-model", documented: judgment({ state: "cacheIt", modeledSavingsMicrocents: 300 }) }),
        row({ model: "wasteful", documented: judgment({ state: "stopCaching", modeledSavingsMicrocents: 900 }) }),
        row({
          model: "broken-a",
          documented: judgment({ state: "investigate", urgency: "overpaying", modeledSavingsMicrocents: 400 }),
        }),
        row({
          model: "broken-b",
          documented: judgment({ state: "investigate", urgency: "underusing", modeledSavingsMicrocents: 200 }),
        }),
      ],
      "documented",
    )

    expect(groups.map((group) => group.state)).toEqual(["stopCaching", "investigate", "cacheIt"])
    expect(groups[1]?.savingsMicrocents).toBe(600)
    expect(groups[1]?.rows.map((entry) => entry.model)).toEqual(["broken-a", "broken-b"])
  })

  it("keeps the settled states, in their own order, after everything actionable", () => {
    const groups = buildCacheStateGroups(
      [
        row({ model: "thin", documented: judgment({ state: "notEnoughData", modeledSavingsMicrocents: null }) }),
        row({ model: "guardrail", documented: judgment({ state: "correctlyOff", modeledSavingsMicrocents: null }) }),
        row({ model: "healthy", documented: judgment({ state: "optimal", modeledSavingsMicrocents: null }) }),
        row({ model: "off-model", documented: judgment({ state: "cacheIt", modeledSavingsMicrocents: 300 }) }),
      ],
      "documented",
    )

    expect(groups.map((group) => group.state)).toEqual(["cacheIt", "optimal", "correctlyOff", "notEnoughData"])
    expect(groups.map((group) => group.isActionable)).toEqual([true, false, false, false])
  })

  it("raises no actionable group for a project where every model is already fine", () => {
    const groups = buildCacheStateGroups(
      [
        row({ model: "healthy", documented: judgment({ state: "optimal", modeledSavingsMicrocents: null }) }),
        row({ model: "guardrail", documented: judgment({ state: "correctlyOff", modeledSavingsMicrocents: null }) }),
      ],
      "documented",
    )

    expect(groups.filter((group) => group.isActionable)).toEqual([])
  })

  it("shows a finding under the floor but keeps its pennies out of the group total", () => {
    // Hiding the row would leave the panel implying the model is fine when it is not.
    const groups = buildCacheStateGroups(
      [
        row({
          model: "pennies",
          documented: judgment({ state: "cacheIt", modeledSavingsMicrocents: 40, savingsClearsFloor: false }),
        }),
      ],
      "documented",
    )

    expect(groups[0]?.rows.map((entry) => entry.model)).toEqual(["pennies"])
    expect(groups[0]?.savingsMicrocents).toBe(0)
  })

  it("regroups when a different lifetime is picked, which is what the control is for", () => {
    const records = [
      row(
        { model: "sensitive", documented: judgment({ state: "optimal", modeledSavingsMicrocents: null }) },
        { 3600: judgment({ state: "investigate", urgency: "underusing", modeledSavingsMicrocents: 9_000_000 }) },
      ),
    ]

    expect(buildCacheStateGroups(records, "documented").map((group) => group.state)).toEqual(["optimal"])
    expect(buildCacheStateGroups(records, 3_600).map((group) => group.state)).toEqual(["investigate"])
  })
})

describe("summariseSettledRows", () => {
  it("counts the models with nothing to do, split by whether we could judge them", () => {
    const settled = summariseSettledRows(
      [
        row({ model: "a", documented: judgment({ state: "optimal" }) }),
        row({ model: "b", documented: judgment({ state: "correctlyOff" }) }),
        row({ model: "c", documented: judgment({ state: "notEnoughData" }) }),
        row({ model: "d", documented: judgment({ state: "cacheIt" }) }),
      ],
      "documented",
    )

    expect(settled).toEqual({ fine: 2, needData: 1 })
  })
})

describe("recoverableShare", () => {
  it("is the share of this model's own spend the finding would recover", () => {
    const view = resolveCacheRow(
      row({ model: "a", costMicrocents: 1_000, documented: judgment({ modeledSavingsMicrocents: 250 }) }),
      "documented",
    )
    expect(recoverableShare(view)).toBeCloseTo(0.25, 4)
  })

  it("is blank without savings or without spend to be a share of", () => {
    expect(
      recoverableShare(
        resolveCacheRow(row({ model: "a", documented: judgment({ modeledSavingsMicrocents: null }) }), "documented"),
      ),
    ).toBeNull()
    expect(recoverableShare(resolveCacheRow(row({ model: "a", costMicrocents: 0 }), "documented"))).toBeNull()
  })

  it("clamps, because savings are modeled and spend is recorded", () => {
    const view = resolveCacheRow(
      row({ model: "a", costMicrocents: 100, documented: judgment({ modeledSavingsMicrocents: 900 }) }),
      "documented",
    )
    expect(recoverableShare(view)).toBe(1)
  })
})

describe("cacheStateIsActionable", () => {
  it("is true for exactly the three states that render a recommendation", () => {
    expect((["cacheIt", "stopCaching", "investigate"] as const).every(cacheStateIsActionable)).toBe(true)
    expect((["optimal", "correctlyOff", "notEnoughData"] as const).some(cacheStateIsActionable)).toBe(false)
  })
})
