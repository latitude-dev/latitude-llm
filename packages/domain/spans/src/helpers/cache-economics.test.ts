import { describe, expect, it } from "vitest"
import {
  CACHE_CEILING_MIN_MATERIAL_GAP,
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
    cachingCostsMore: false,
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
    it("is optimal once caching is paying and there is no headroom to chase", () => {
      expect(classify({ actualRate: 0.2174 })).toEqual({ state: "optimal", urgency: null })
    })

    it("flags caching that is costing money without prescribing a fix", () => {
      expect(classify({ actualRate: 0.05, cachingCostsMore: true })).toEqual({
        state: "investigate",
        urgency: "overpaying",
      })
    })

    it("reads whether caching is paying from the measured split, not the rate", () => {
      // The claude-opus-4-6 shape: 10% read, 30% written, 60% plain uncached input. Well
      // under the 21.7% break-even, and cheaper than not caching, because break-even
      // assumes every miss is written and partial prefix caching does not.
      expect(classify({ actualRate: 0.1, cachingCostsMore: false }).urgency).toBeNull()
      // Same rate, a write share that really is not paying for itself.
      expect(classify({ actualRate: 0.1, cachingCostsMore: true }).urgency).toBe("overpaying")
    })

    it("says stop caching only once the ceiling proves break-even is unreachable", () => {
      expect(classify({ actualRate: 0.05, cachingCostsMore: true, ceilingRate: 0.1 })).toEqual({
        state: "stopCaching",
        urgency: "overpaying",
      })
    })

    it("stays investigate when the ceiling clears break-even but caching is losing money", () => {
      expect(classify({ actualRate: 0.05, cachingCostsMore: true, ceilingRate: 0.8 })).toEqual({
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

    it("absorbs the few points of fresh suffix a well-run agent always carries", () => {
      // The healthy seed archetype's three agents, whose gaps are the calibration
      // this band exists for. Flagging any of them would make `optimal` unreachable.
      expect(classify({ actualRate: 0.8708, ceilingRate: 0.9167 }).state).toBe("optimal")
      expect(classify({ actualRate: 0.828, ceilingRate: 0.9 }).state).toBe("optimal")
      expect(classify({ actualRate: 0.8138, ceilingRate: 0.875 }).state).toBe("optimal")
    })

    it("flags a gap past the band and stays quiet just inside it", () => {
      const ceilingRate = 0.9
      expect(classify({ actualRate: 0.79, ceilingRate }).state).toBe("investigate")
      expect(classify({ actualRate: 0.81, ceilingRate }).state).toBe("optimal")
      expect(CACHE_CEILING_MIN_MATERIAL_GAP).toBeGreaterThan(0.9 - 0.81)
      expect(CACHE_CEILING_MIN_MATERIAL_GAP).toBeLessThan(0.9 - 0.79)
    })

    it("is optimal on a zero break-even model at any rate above zero", () => {
      expect(classify({ actualRate: 0.03, breakEvenRate: 0 })).toEqual({ state: "optimal", urgency: null })
    })

    it("keeps break-even as the reference for the unreachable test, which has no split to read", () => {
      // A hit rate this traffic has never had has no measured split, so the steady-state
      // break-even is the only thing that can answer "would the ceiling even pay?".
      expect(
        classify({ actualRate: 0.05, cachingCostsMore: true, ceilingRate: 0.1, breakEvenRate: 0.2174 }).state,
      ).toBe("stopCaching")
      expect(
        classify({ actualRate: 0.05, cachingCostsMore: true, ceilingRate: 0.3, breakEvenRate: 0.2174 }).state,
      ).toBe("investigate")
    })
  })

  describe("caching off", () => {
    const off = { cachingOn: false, actualRate: 0 } as const

    it("recommends caching when the ceiling clears break-even", () => {
      expect(classify({ ...off, ceilingRate: 0.6 })).toEqual({ state: "cacheIt", urgency: null })
    })

    it("stays quiet when the cadence leaves nothing worth caching, whatever break-even says", () => {
      // Isolated calls reach 0%, which technically "clears" a 0% break-even. Turning
      // caching on would buy nothing, so recommending it would be noise.
      expect(classify({ ...off, breakEvenRate: 0, ceilingRate: 0 })).toEqual({
        state: "correctlyOff",
        urgency: null,
      })
      expect(classify({ ...off, breakEvenRate: 0, ceilingRate: CACHE_CEILING_MIN_MATERIAL_GAP })).toEqual({
        state: "cacheIt",
        urgency: null,
      })
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
