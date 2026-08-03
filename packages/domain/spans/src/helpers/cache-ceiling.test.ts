import { describe, expect, it } from "vitest"
import {
  CACHE_SAVINGS_MIN_SPEND_SHARE,
  CACHE_SAVINGS_MIN_WEEKLY_MICROCENTS,
  cacheCeilingRate,
  cacheCeilingSavingsMicrocents,
  clearsCacheSavingsFloor,
  modeledInputCostMicrocents,
  weeklyCacheSavingsMicrocents,
} from "./cache-ceiling.ts"
import type { CacheState } from "./cache-economics.ts"

const MICROCENTS_PER_USD = 100_000_000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Anthropic-shaped: 1.25x write, 0.1x read, so break-even lands at 21.7%. */
const ANTHROPIC = { input: 5, cacheRead: 0.5, cacheWrite: 6.25 }
/** No cache-write price at all, so a miss is billed as plain input. */
const NO_PREMIUM = { input: 0.25, cacheRead: 0.025 }

describe("cacheCeilingRate", () => {
  it("is the warm share of cache-eligible volume", () => {
    expect(cacheCeilingRate({ cacheableTokens: 6_000, warmTokens: 5_000 })).toBeCloseTo(0.8333, 4)
  })

  it("is zero when every call arrives too late to find a warm entry", () => {
    expect(cacheCeilingRate({ cacheableTokens: 6_000, warmTokens: 0 })).toBe(0)
  })

  it("is null with no volume to divide by, rather than zero", () => {
    expect(cacheCeilingRate({ cacheableTokens: 0, warmTokens: 0 })).toBeNull()
  })

  it("clamps rather than reporting a rate above 100%", () => {
    expect(cacheCeilingRate({ cacheableTokens: 100, warmTokens: 140 })).toBe(1)
  })
})

describe("modeledInputCostMicrocents", () => {
  it("prices each of the three input-side token kinds at its own rate", () => {
    const cost = modeledInputCostMicrocents(
      { inputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheCreateTokens: 1_000_000 },
      ANTHROPIC,
    )
    expect(cost).toBeCloseTo((5 + 0.5 + 6.25) * MICROCENTS_PER_USD, 0)
  })

  it("bills a write at the input rate when the model charges no write premium", () => {
    const cost = modeledInputCostMicrocents(
      { inputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 1_000_000 },
      NO_PREMIUM,
    )
    expect(cost).toBeCloseTo(0.25 * MICROCENTS_PER_USD, 0)
  })
})

const savings = (args: {
  state: CacheState
  ceilingRate: number | null
  flow: { inputTokens: number; cacheReadTokens: number; cacheCreateTokens: number }
  pricing?: { input: number; cacheRead?: number; cacheWrite?: number }
}) =>
  cacheCeilingSavingsMicrocents({
    flow: args.flow,
    pricing: args.pricing ?? ANTHROPIC,
    ceilingRate: args.ceilingRate,
    state: args.state,
  })

describe("cacheCeilingSavingsMicrocents", () => {
  it("is blank for every state that renders no recommendation", () => {
    const flow = { inputTokens: 1_000_000, cacheReadTokens: 0, cacheCreateTokens: 0 }
    for (const state of ["optimal", "correctlyOff", "notEnoughData"] as const) {
      expect(savings({ state, ceilingRate: 0.9, flow })).toBeNull()
    }
  })

  it("prices turning caching on against reaching the ceiling", () => {
    // 1M tokens of plain input at $0.25, against 80% read at $0.025 and 20% still
    // billed as input because this model charges no write premium.
    const result = savings({
      state: "cacheIt",
      ceilingRate: 0.8,
      flow: { inputTokens: 1_000_000, cacheReadTokens: 0, cacheCreateTokens: 0 },
      pricing: NO_PREMIUM,
    })
    const expected = (0.25 - (0.8 * 0.025 + 0.2 * 0.25)) * MICROCENTS_PER_USD
    expect(result).toBeCloseTo(expected, 0)
  })

  it("prices stopping against caching switched off, not against the ceiling it was told to abandon", () => {
    // Caching on and losing: 5% read, 28% written at a 1.25x premium. Reaching a
    // ceiling of 0 would cost *more* than today, so pricing that counterfactual
    // would report the cost of following the opposite advice.
    const flow = { inputTokens: 670_000, cacheReadTokens: 50_000, cacheCreateTokens: 280_000 }
    const result = savings({ state: "stopCaching", ceilingRate: 0, flow })
    const current = modeledInputCostMicrocents(flow, ANTHROPIC)
    expect(result).toBeCloseTo(current - 1_000_000 * (5 / 1_000_000) * MICROCENTS_PER_USD, 0)
    expect(result).toBeGreaterThan(0)
  })

  it("is blank when acting would cost money rather than save it", () => {
    // Already at the ceiling on a write-premium model: closing a gap of zero buys
    // nothing, and the write premium on the remaining misses makes it worse.
    const flow = { inputTokens: 100_000, cacheReadTokens: 900_000, cacheCreateTokens: 0 }
    expect(savings({ state: "investigate", ceilingRate: 0.5, flow })).toBeNull()
  })

  it("is blank for an actionable state whose ceiling is unknown", () => {
    const flow = { inputTokens: 1_000_000, cacheReadTokens: 0, cacheCreateTokens: 0 }
    expect(savings({ state: "cacheIt", ceilingRate: null, flow })).toBeNull()
    // `stopCaching` needs no ceiling: switching caching off is priced from the measured split.
    expect(
      savings({
        state: "stopCaching",
        ceilingRate: null,
        flow: { inputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 1_000_000 },
      }),
    ).toBeGreaterThan(0)
  })

  it("is blank with no volume and with no price to model against", () => {
    expect(
      savings({
        state: "cacheIt",
        ceilingRate: 0.9,
        flow: { inputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0 },
      }),
    ).toBeNull()
    expect(
      savings({
        state: "cacheIt",
        ceilingRate: 0.9,
        flow: { inputTokens: 1_000, cacheReadTokens: 0, cacheCreateTokens: 0 },
        pricing: { input: 0 },
      }),
    ).toBeNull()
  })
})

describe("the spend floor", () => {
  // Spend high enough that the relative bar never binds, so these cases isolate the
  // absolute one.
  const NO_RELATIVE_BAR = { windowSpendMicrocents: 0 }

  it("restates a window's savings as the weekly rate the absolute floor is defined at", () => {
    expect(weeklyCacheSavingsMicrocents({ savingsMicrocents: 100, windowMs: WEEK_MS })).toBe(100)
    expect(weeklyCacheSavingsMicrocents({ savingsMicrocents: 100, windowMs: WEEK_MS / 7 })).toBe(700)
    expect(weeklyCacheSavingsMicrocents({ savingsMicrocents: 700, windowMs: WEEK_MS * 4 })).toBe(175)
  })

  it("reads a zero-length window as no savings rather than infinite ones", () => {
    expect(weeklyCacheSavingsMicrocents({ savingsMicrocents: 100, windowMs: 0 })).toBe(0)
  })

  it("suppresses the same dollar figure on a long window and passes it on a short one", () => {
    // $0.50 over a week is noise; the same $0.50 in a single day is $3.50/week.
    const savingsMicrocents = MICROCENTS_PER_USD / 2
    expect(clearsCacheSavingsFloor({ savingsMicrocents, windowMs: WEEK_MS, ...NO_RELATIVE_BAR })).toBe(false)
    expect(clearsCacheSavingsFloor({ savingsMicrocents, windowMs: WEEK_MS / 7, ...NO_RELATIVE_BAR })).toBe(true)
  })

  it("passes exactly at the absolute floor and never passes a blank or negative figure", () => {
    expect(
      clearsCacheSavingsFloor({
        savingsMicrocents: CACHE_SAVINGS_MIN_WEEKLY_MICROCENTS,
        windowMs: WEEK_MS,
        ...NO_RELATIVE_BAR,
      }),
    ).toBe(true)
    expect(clearsCacheSavingsFloor({ savingsMicrocents: null, windowMs: WEEK_MS, ...NO_RELATIVE_BAR })).toBe(false)
    expect(clearsCacheSavingsFloor({ savingsMicrocents: 0, windowMs: WEEK_MS, ...NO_RELATIVE_BAR })).toBe(false)
  })

  describe("scaling with spend", () => {
    const weekly = (usd: number) => usd * MICROCENTS_PER_USD
    const clears = (savingsUsd: number, spendUsd: number) =>
      clearsCacheSavingsFloor({
        savingsMicrocents: weekly(savingsUsd),
        windowMs: WEEK_MS,
        windowSpendMicrocents: weekly(spendUsd),
      })

    it("suppresses a thousandth of a large bill that the absolute floor would wave through", () => {
      // $50/week is real money in isolation and a rounding error against $50k of spend.
      expect(clears(50, 50_000)).toBe(false)
      expect(clears(600, 50_000)).toBe(true)
    })

    it("still suppresses half the spend of a model too cheap to matter", () => {
      // The relative bar alone would promote this; the absolute one is what stops it.
      expect(clears(0.02, 0.04)).toBe(false)
    })

    it("keeps the absolute bar in charge for a small project, where a share is meaningless", () => {
      // 1% of $5 is half a cent, so without the absolute floor everything would fire.
      expect(clears(0.1, 5)).toBe(false)
      expect(clears(2, 5)).toBe(true)
    })

    it("falls back to the absolute bar rather than dividing by no spend", () => {
      expect(clears(2, 0)).toBe(true)
      expect(clears(0.1, 0)).toBe(false)
    })

    it("passes exactly at the share, so the constant is the boundary it claims to be", () => {
      const spendUsd = 1_000
      expect(clears(spendUsd * CACHE_SAVINGS_MIN_SPEND_SHARE, spendUsd)).toBe(true)
      expect(clears(spendUsd * CACHE_SAVINGS_MIN_SPEND_SHARE * 0.99, spendUsd)).toBe(false)
    })
  })
})
