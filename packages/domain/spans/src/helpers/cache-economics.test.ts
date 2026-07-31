import { describe, expect, it } from "vitest"
import {
  CACHE_ECONOMICS_MIN_CALLS,
  CACHE_MIN_CACHEABLE_INPUT_TOKENS,
  type CacheClassificationInput,
  cacheBreakEvenRate,
  classifyCacheState,
} from "./cache-economics.ts"

const ANTHROPIC = { input: 3, cacheRead: 0.3, cacheWrite: 3.75 }
const OPENAI = { input: 2.5, cacheRead: 1.25 }

describe("cacheBreakEvenRate", () => {
  it("derives Anthropic's write premium from its own prices", () => {
    expect(cacheBreakEvenRate(ANTHROPIC)).toBeCloseTo(0.2174, 4)
  })

  it("collapses to 0% when the provider charges no write premium", () => {
    expect(cacheBreakEvenRate(OPENAI)).toBe(0)
  })

  it("holds across an Anthropic tier regardless of absolute price", () => {
    expect(cacheBreakEvenRate({ input: 1, cacheRead: 0.1, cacheWrite: 1.25 })).toBeCloseTo(0.2174, 4)
    expect(cacheBreakEvenRate({ input: 15, cacheRead: 1.5, cacheWrite: 18.75 })).toBeCloseTo(0.2174, 4)
  })

  it("is null without a cache-read price, which is an absence rather than a 0% floor", () => {
    expect(cacheBreakEvenRate({ input: 3 })).toBeNull()
    expect(cacheBreakEvenRate({ input: 3, cacheWrite: 3.75 })).toBeNull()
  })

  it("is null for a model with no input price, which has no economics to compare", () => {
    expect(cacheBreakEvenRate({ input: 0, cacheRead: 0 })).toBeNull()
  })

  it("treats free reads as free upside", () => {
    expect(cacheBreakEvenRate({ input: 2, cacheRead: 0 })).toBe(0)
  })

  it("returns 0 rather than a negative rate when writing is cheaper than fresh input", () => {
    expect(cacheBreakEvenRate({ input: 3, cacheRead: 0.3, cacheWrite: 1 })).toBe(0)
  })

  it("handles reads and writes priced alike, where the hit rate stops mattering", () => {
    expect(cacheBreakEvenRate({ input: 3, cacheRead: 2, cacheWrite: 2 })).toBe(0)
    expect(cacheBreakEvenRate({ input: 3, cacheRead: 4, cacheWrite: 4 })).toBeNull()
  })
})

const classify = (overrides: Partial<CacheClassificationInput>) =>
  classifyCacheState({
    cachingOn: true,
    actualRate: 0.5,
    ceilingRate: null,
    breakEvenRate: 0.2174,
    calls: 100,
    avgInputTokensPerCall: 8_000,
    ...overrides,
  })

describe("classifyCacheState", () => {
  it("holds back every verdict below the sample floor", () => {
    expect(classify({ calls: CACHE_ECONOMICS_MIN_CALLS - 1 }).state).toBe("notEnoughData")
    expect(classify({ calls: CACHE_ECONOMICS_MIN_CALLS }).state).toBe("optimal")
  })

  it("holds back a verdict when the model has no cache pricing", () => {
    expect(classify({ breakEvenRate: null }).state).toBe("notEnoughData")
  })

  it("holds back a verdict when no input-side token was recorded", () => {
    expect(classify({ actualRate: null }).state).toBe("notEnoughData")
  })

  describe("caching on", () => {
    it("is optimal once the rate clears break-even", () => {
      expect(classify({ actualRate: 0.2174 })).toEqual({ state: "optimal", urgency: null })
    })

    it("flags a rate below break-even without prescribing a fix", () => {
      expect(classify({ actualRate: 0.05 })).toEqual({ state: "investigate", urgency: "overpaying" })
    })

    it("says stop caching only once the ceiling proves break-even is unreachable", () => {
      expect(classify({ actualRate: 0.05, ceilingRate: 0.1 })).toEqual({
        state: "stopCaching",
        urgency: "overpaying",
      })
    })

    it("stays investigate when the ceiling clears break-even but the rate does not", () => {
      expect(classify({ actualRate: 0.05, ceilingRate: 0.8 })).toEqual({
        state: "investigate",
        urgency: "overpaying",
      })
    })

    it("separates savings left on the table from actively overpaying", () => {
      expect(classify({ actualRate: 0.4, ceilingRate: 0.9 })).toEqual({
        state: "investigate",
        urgency: "underusing",
      })
    })

    it("is optimal at the ceiling", () => {
      expect(classify({ actualRate: 0.9, ceilingRate: 0.9 })).toEqual({ state: "optimal", urgency: null })
    })

    it("is optimal on a zero break-even model at any rate above zero", () => {
      expect(classify({ actualRate: 0.03, breakEvenRate: 0 })).toEqual({ state: "optimal", urgency: null })
    })
  })

  describe("caching off", () => {
    const off = { cachingOn: false, actualRate: 0 } as const

    it("recommends caching when the ceiling clears break-even", () => {
      expect(classify({ ...off, ceilingRate: 0.6 })).toEqual({ state: "cacheIt", urgency: null })
    })

    it("stays quiet when the ceiling cannot clear break-even", () => {
      expect(classify({ ...off, ceilingRate: 0.1 })).toEqual({ state: "correctlyOff", urgency: null })
    })

    it("recommends caching without a ceiling when there is no write premium to lose", () => {
      expect(classify({ ...off, breakEvenRate: 0 })).toEqual({ state: "cacheIt", urgency: null })
    })

    it("makes no claim without a ceiling when the model charges a write premium", () => {
      expect(classify({ ...off }).state).toBe("notEnoughData")
    })

    it("never recommends caching a prompt shorter than any provider will cache", () => {
      const tiny = { ...off, avgInputTokensPerCall: CACHE_MIN_CACHEABLE_INPUT_TOKENS - 1 } as const
      expect(classify({ ...tiny, breakEvenRate: 0 })).toEqual({ state: "correctlyOff", urgency: null })
      expect(classify({ ...tiny, ceilingRate: 0.9 })).toEqual({ state: "correctlyOff", urgency: null })
      expect(
        classify({ ...off, avgInputTokensPerCall: CACHE_MIN_CACHEABLE_INPUT_TOKENS, breakEvenRate: 0 }).state,
      ).toBe("cacheIt")
    })
  })
})
