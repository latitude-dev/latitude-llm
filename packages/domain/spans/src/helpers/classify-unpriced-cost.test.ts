import { describe, expect, it } from "vitest"
import type { CostZeroCostPair } from "../ports/cost-analytics-repository.ts"
import { classifyUnpricedPair, summarizeUnpricedUsage } from "./classify-unpriced-cost.ts"

const pair = (provider: string, model: string, tokens = 1_000, calls = 10): CostZeroCostPair => ({
  provider,
  model,
  tokens,
  calls,
  source: "unpriced",
})

describe("classifyUnpricedPair", () => {
  it("calls a pair the registry prices today a repairable ingest gap", () => {
    expect(classifyUnpricedPair(pair("anthropic", "claude-sonnet-4-5")).cause).toBe("ingestGap")
  })

  it("calls a pair the registry still cannot price a standing gap", () => {
    expect(classifyUnpricedPair(pair("acme-proxy", "our-own-llama")).cause).toBe("missingPricing")
  })

  it("classifies a pre-cost-source row the same way, from the registry alone", () => {
    const legacy = { ...pair("acme-proxy", "our-own-llama"), source: "unknown" } as const

    expect(classifyUnpricedPair(legacy)).toMatchObject({ cause: "missingPricing", source: "unknown" })
  })
})

describe("summarizeUnpricedUsage", () => {
  it("keeps free models out of the gap figures", () => {
    const summary = summarizeUnpricedUsage({
      zeroCostPairs: [pair("acme-proxy", "our-own-llama", 400, 4)],
      billableTokens: 1_000,
    })

    expect(summary.gapTokens).toBe(400)
    expect(summary.gapPairCount).toBe(1)
    expect(summary.pricedCoverage).toBeCloseTo(0.6)
  })

  it("reads full coverage when nothing is unpriced", () => {
    const summary = summarizeUnpricedUsage({ zeroCostPairs: [], billableTokens: 1_000 })

    expect(summary.gapTokens).toBe(0)
    expect(summary.pricedCoverage).toBe(1)
  })

  it("has no coverage to report without billable tokens", () => {
    expect(summarizeUnpricedUsage({ zeroCostPairs: [], billableTokens: 0 }).pricedCoverage).toBeNull()
  })
})
