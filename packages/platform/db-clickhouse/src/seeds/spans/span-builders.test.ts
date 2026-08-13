import type { ModelRegistryPricing } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { CACHE_OFF, inputSideCostMicrocents, splitCacheTokens } from "./span-builders.ts"

/** `claude-opus-4-5`'s registry rates: a 1.25x write premium and a 0.1x read. */
const anthropicStyle: ModelRegistryPricing = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }

const noCachePricing: ModelRegistryPricing = { input: 5, output: 25 }

describe("splitCacheTokens", () => {
  it("carves reads and writes out of the prompt so the token columns stay additive", () => {
    const split = splitCacheTokens(10_000, { hitRate: 0.6, writeShare: 0.1 })

    expect(split).toEqual({ input: 3_000, cacheRead: 6_000, cacheCreate: 1_000 })
    expect(split.input + split.cacheRead + split.cacheCreate).toBe(10_000)
  })

  it("leaves the whole prompt uncached when caching is off", () => {
    expect(splitCacheTokens(10_000, CACHE_OFF)).toEqual({ input: 10_000, cacheRead: 0, cacheCreate: 0 })
  })

  it("never returns a negative input remainder", () => {
    expect(splitCacheTokens(1_000, { hitRate: 0.8, writeShare: 0.5 }).input).toBe(0)
  })
})

describe("inputSideCostMicrocents", () => {
  it("prices reads and writes at their own rates, folded into the input side", () => {
    const split = splitCacheTokens(1_000_000, { hitRate: 0.6, writeShare: 0.1 })

    // 300k at $5 + 600k at $0.50 + 100k at $6.25 = $1.50 + $0.30 + $0.625
    expect(inputSideCostMicrocents(split, anthropicStyle)).toBe(242_500_000)
  })

  it("charges cache tokens at the input rate when the model publishes no cache price", () => {
    const split = splitCacheTokens(1_000_000, { hitRate: 0.6, writeShare: 0.1 })

    expect(inputSideCostMicrocents(split, noCachePricing)).toBe(
      inputSideCostMicrocents(splitCacheTokens(1_000_000, CACHE_OFF), noCachePricing),
    )
  })

  it("costs an unpriced pair at nothing rather than guessing a rate", () => {
    expect(inputSideCostMicrocents(splitCacheTokens(1_000_000, CACHE_OFF), null)).toBe(0)
  })
})
