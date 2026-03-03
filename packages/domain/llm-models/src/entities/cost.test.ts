import { describe, expect, it } from "vitest"
import {
  type ModelCostTier,
  type TokenUsage,
  computeCostBreakdown,
  computeTokenCost,
  estimateTotalCost,
} from "./cost.ts"

describe("computeTokenCost", () => {
  const tier: ModelCostTier = { input: 2.5, output: 10 }

  it("computes input cost per 1M tokens", () => {
    const cost = computeTokenCost(tier, 1_000_000, "input")
    expect(cost).toBeCloseTo(2.5)
  })

  it("computes output cost per 1M tokens", () => {
    const cost = computeTokenCost(tier, 1_000_000, "output")
    expect(cost).toBeCloseTo(10)
  })

  it("returns zero for zero tokens", () => {
    expect(computeTokenCost(tier, 0, "input")).toBe(0)
    expect(computeTokenCost(tier, 0, "output")).toBe(0)
  })

  it("computes fractional token counts correctly", () => {
    const cost = computeTokenCost(tier, 500_000, "input")
    expect(cost).toBeCloseTo(1.25)
  })

  it("falls back reasoning to output rate when reasoning is undefined", () => {
    const cost = computeTokenCost(tier, 1_000_000, "reasoning")
    expect(cost).toBeCloseTo(10)
  })

  it("falls back cacheRead to input rate when cacheRead is undefined", () => {
    const cost = computeTokenCost(tier, 1_000_000, "cacheRead")
    expect(cost).toBeCloseTo(2.5)
  })

  it("uses explicit reasoning rate when provided", () => {
    const withReasoning: ModelCostTier = { input: 2.5, output: 10, reasoning: 5 }
    const cost = computeTokenCost(withReasoning, 1_000_000, "reasoning")
    expect(cost).toBeCloseTo(5)
  })

  it("uses explicit cacheRead rate when provided", () => {
    const withCache: ModelCostTier = { input: 2.5, output: 10, cacheRead: 0.5 }
    const cost = computeTokenCost(withCache, 1_000_000, "cacheRead")
    expect(cost).toBeCloseTo(0.5)
  })

  describe("tiered pricing", () => {
    const tiers: ModelCostTier[] = [
      { input: 2.5, output: 10, tokensRangeStart: 0 },
      { input: 5.0, output: 20, tokensRangeStart: 128_000 },
    ]

    it("applies first tier for tokens within first range", () => {
      const cost = computeTokenCost(tiers, 100_000, "input")
      expect(cost).toBeCloseTo((2.5 * 100_000) / 1_000_000)
    })

    it("applies both tiers when tokens span ranges", () => {
      const cost = computeTokenCost(tiers, 200_000, "input")
      const tier1Cost = (2.5 * 128_000) / 1_000_000
      const tier2Cost = (5.0 * 72_000) / 1_000_000
      expect(cost).toBeCloseTo(tier1Cost + tier2Cost)
    })

    it("handles unsorted tiers", () => {
      const unsorted: ModelCostTier[] = [
        { input: 5.0, output: 20, tokensRangeStart: 128_000 },
        { input: 2.5, output: 10, tokensRangeStart: 0 },
      ]
      const cost = computeTokenCost(unsorted, 200_000, "input")
      const tier1Cost = (2.5 * 128_000) / 1_000_000
      const tier2Cost = (5.0 * 72_000) / 1_000_000
      expect(cost).toBeCloseTo(tier1Cost + tier2Cost)
    })
  })
})

describe("estimateTotalCost", () => {
  const tier: ModelCostTier = { input: 2.5, output: 10, reasoning: 5, cacheRead: 0.5 }

  it("sums costs for all token types", () => {
    const usage: TokenUsage = {
      promptTokens: 1_000_000,
      completionTokens: 500_000,
      reasoningTokens: 200_000,
      cachedInputTokens: 300_000,
    }

    const expected =
      (2.5 * 1_000_000) / 1_000_000 +
      (0.5 * 300_000) / 1_000_000 +
      (5 * 200_000) / 1_000_000 +
      (10 * 500_000) / 1_000_000

    expect(estimateTotalCost(tier, usage)).toBeCloseTo(expected)
  })

  it("handles NaN token counts by treating them as zero", () => {
    const usage: TokenUsage = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
      reasoningTokens: Number.NaN,
      cachedInputTokens: Number.NaN,
    }

    expect(estimateTotalCost(tier, usage)).toBe(0)
  })

  it("handles undefined optional tokens", () => {
    const usage: TokenUsage = {
      promptTokens: 1_000_000,
      completionTokens: 500_000,
    }

    const expected = (2.5 * 1_000_000) / 1_000_000 + (10 * 500_000) / 1_000_000

    expect(estimateTotalCost(tier, usage)).toBeCloseTo(expected)
  })
})

describe("computeCostBreakdown", () => {
  const tier: ModelCostTier = { input: 2.5, output: 10, reasoning: 5, cacheRead: 0.5 }

  it("returns breakdown with all categories", () => {
    const usage: TokenUsage = {
      promptTokens: 2_000_000,
      completionTokens: 500_000,
      reasoningTokens: 300_000,
      cachedInputTokens: 1_000_000,
    }

    const breakdown = computeCostBreakdown(tier, usage)

    expect(breakdown.input.prompt.tokens).toBe(2_000_000)
    expect(breakdown.input.prompt.cost).toBeCloseTo(5)
    expect(breakdown.input.cached.tokens).toBe(1_000_000)
    expect(breakdown.input.cached.cost).toBeCloseTo(0.5)
    expect(breakdown.output.reasoning.tokens).toBe(300_000)
    expect(breakdown.output.reasoning.cost).toBeCloseTo(1.5)
    expect(breakdown.output.completion.tokens).toBe(500_000)
    expect(breakdown.output.completion.cost).toBeCloseTo(5)
  })

  it("converts NaN tokens to zero", () => {
    const usage: TokenUsage = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    }

    const breakdown = computeCostBreakdown(tier, usage)
    expect(breakdown.input.prompt.tokens).toBe(0)
    expect(breakdown.input.prompt.cost).toBe(0)
    expect(breakdown.output.completion.tokens).toBe(0)
    expect(breakdown.output.completion.cost).toBe(0)
  })
})
