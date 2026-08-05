import { describe, expect, it } from "vitest"
import type { CacheState, CacheUrgency } from "./cache-economics.ts"
import {
  CACHE_SIGNAL_MIN_CALLS,
  CACHE_SIGNAL_STABILITY_WINDOWS,
  cacheFindingFingerprint,
  evaluateCacheFinding,
  reviewCacheFindings,
} from "./cache-finding.ts"
import type { CacheModelJudgment, JudgedCacheModel } from "./judge-cache-economics.ts"

const judgment = (overrides: Partial<CacheModelJudgment> = {}): CacheModelJudgment => ({
  state: "investigate",
  urgency: "underusing",
  cachingOn: true,
  actualRate: 0.1,
  ceilingRate: 0.86,
  breakEvenRate: 0.217,
  modeledSavingsMicrocents: 500_000_000,
  savingsClearsFloor: true,
  ...overrides,
})

const row = (overrides: Partial<JudgedCacheModel> = {}): JudgedCacheModel => ({
  provider: "anthropic",
  model: "claude-haiku-4-5",
  calls: 4_000,
  inputTokens: 40_000_000,
  cacheReadTokens: 5_000_000,
  cacheCreateTokens: 1_000_000,
  costMicrocents: 20_000_000_000,
  unpricedCalls: 0,
  unpricedTokens: 0,
  documented: judgment(),
  documentedLifetimeSeconds: 300,
  byLifetimeSeconds: {},
  verdictDependsOnLifetime: false,
  ...overrides,
})

/** A finding that has held for exactly the stability requirement. */
const steady = (entry: JudgedCacheModel): readonly (readonly JudgedCacheModel[])[] =>
  Array.from({ length: CACHE_SIGNAL_STABILITY_WINDOWS }, () => [entry])

describe("evaluateCacheFinding", () => {
  it("fires on a stable actionable verdict and reports the LAT-811 payload", () => {
    const evaluated = evaluateCacheFinding(row())
    expect(evaluated.fires).toBe(true)
    if (!evaluated.fires) return
    expect(evaluated.measures).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      state: "investigate",
      urgency: "underusing",
      actualRate: 0.1,
      breakEvenRate: 0.217,
      ceilingRate: 0.86,
      modeledSavingsMicrocents: 500_000_000,
      calls: 4_000,
      spendMicrocents: 20_000_000_000,
      cacheLifetimeSeconds: 300,
    })
  })

  it.each([
    ["optimal", null],
    ["correctlyOff", null],
    ["notEnoughData", null],
  ] as const satisfies readonly (readonly [
    CacheState,
    CacheUrgency | null,
  ])[])("never fires for %s, whatever the savings say", (state, urgency) => {
    const evaluated = evaluateCacheFinding(row({ documented: judgment({ state, urgency }) }))
    expect(evaluated).toEqual({ fires: false, suppressedBy: "notActionable" })
  })

  it("holds a sample floor well above the panel's", () => {
    expect(evaluateCacheFinding(row({ calls: CACHE_SIGNAL_MIN_CALLS - 1 }))).toEqual({
      fires: false,
      suppressedBy: "sampleFloor",
    })
    expect(evaluateCacheFinding(row({ calls: CACHE_SIGNAL_MIN_CALLS })).fires).toBe(true)
  })

  it("holds the spend floor the recommendation cards already use", () => {
    expect(evaluateCacheFinding(row({ documented: judgment({ savingsClearsFloor: false }) }))).toEqual({
      fires: false,
      suppressedBy: "spendFloor",
    })
  })

  it("refuses to fire without a ceiling, which is the whole premise of dispatching", () => {
    // `investigate/overpaying` is reachable with no ceiling at all, so this gate is
    // load-bearing rather than implied by the state.
    const overpaying = judgment({ state: "investigate", urgency: "overpaying", ceilingRate: null })
    expect(evaluateCacheFinding(row({ documented: overpaying }))).toEqual({
      fires: false,
      suppressedBy: "unknownCeiling",
    })
  })

  it("refuses to fire when no provider documentation covers the pair", () => {
    expect(evaluateCacheFinding(row({ documentedLifetimeSeconds: null }))).toEqual({
      fires: false,
      suppressedBy: "unknownCeiling",
    })
  })

  it("refuses to fire when the verdict turns on which lifetime the provider is running", () => {
    expect(evaluateCacheFinding(row({ verdictDependsOnLifetime: true }))).toEqual({
      fires: false,
      suppressedBy: "lifetimeAmbiguous",
    })
  })

  it("suppresses on the sample floor before the spend floor, so the report names the binding gate", () => {
    const sparse = row({ calls: 5, documented: judgment({ savingsClearsFloor: false }) })
    expect(evaluateCacheFinding(sparse)).toEqual({ fires: false, suppressedBy: "sampleFloor" })
  })
})

describe("reviewCacheFindings", () => {
  it("fires when the finding holds across every stability window", () => {
    const review = reviewCacheFindings(steady(row()))
    expect(review.findings.map((finding) => finding.fingerprint)).toEqual([
      "cache:anthropic:claude-haiku-4-5:investigate",
    ])
    expect(review.suppressed).toEqual([])
  })

  it("returns nothing at all with fewer windows than the stability requirement", () => {
    const short = Array.from({ length: CACHE_SIGNAL_STABILITY_WINDOWS - 1 }, () => [row()])
    expect(reviewCacheFindings(short)).toEqual({ findings: [], suppressed: [] })
  })

  it("does not fire when an older window suppressed the same model", () => {
    const windows = [[row()], [row()], [row({ documented: judgment({ savingsClearsFloor: false }) })]]
    const review = reviewCacheFindings(windows)
    expect(review.findings).toEqual([])
    expect(review.suppressed).toEqual([
      { provider: "anthropic", model: "claude-haiku-4-5", state: "investigate", suppressedBy: "unstable" },
    ])
  })

  it("does not fire when the state changed inside the stability window", () => {
    // A recommendation that moved is a different recommendation, so the clock restarts
    // rather than the newest verdict inheriting the older one's tenure.
    const windows = [
      [row()],
      [row()],
      [row({ documented: judgment({ state: "stopCaching", urgency: "overpaying", ceilingRate: 0.05 }) })],
    ]
    expect(reviewCacheFindings(windows).findings).toEqual([])
  })

  it("does not fire when the model is absent from an older window", () => {
    expect(reviewCacheFindings([[row()], [row()], []]).findings).toEqual([])
  })

  it("does not churn on a series oscillating around the threshold", () => {
    // Each single evaluation is defensible; the alternation is what must not reach an
    // inbox. Every rolling view of this series has one dissenting window.
    const series = [
      row(),
      row({ documented: judgment({ savingsClearsFloor: false }) }),
      row(),
      row({ documented: judgment({ savingsClearsFloor: false }) }),
      row(),
      row({ documented: judgment({ savingsClearsFloor: false }) }),
    ].map((entry) => [entry])

    for (let offset = 0; offset + CACHE_SIGNAL_STABILITY_WINDOWS <= series.length; offset++) {
      const review = reviewCacheFindings(series.slice(offset))
      expect(review.findings, `windows starting at ${offset}`).toEqual([])
    }
  })

  it("ignores windows beyond the stability requirement, so an old lull cannot block forever", () => {
    const windows = [...steady(row()), [row({ documented: judgment({ savingsClearsFloor: false }) })]]
    expect(reviewCacheFindings(windows).findings).toHaveLength(1)
  })
})

describe("cacheFindingFingerprint", () => {
  it("separates states, so a changed recommendation opens its own signal", () => {
    const base = { provider: "anthropic", model: "claude-opus-4-5" } as const
    expect(cacheFindingFingerprint({ ...base, state: "investigate" })).not.toBe(
      cacheFindingFingerprint({ ...base, state: "stopCaching" }),
    )
  })

  it("normalises provider and model so a slug cannot break the dedupe key", () => {
    expect(cacheFindingFingerprint({ provider: "Amazon Bedrock", model: "eu.Claude/Opus 4.5", state: "cacheIt" })).toBe(
      "cache:amazon-bedrock:eu.claude-opus-4.5:cacheIt",
    )
  })
})
