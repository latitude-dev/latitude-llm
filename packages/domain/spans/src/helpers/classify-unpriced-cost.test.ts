import { describe, expect, it } from "vitest"
import { classifyUnpricedPair, summarizeUnpricedUsage } from "./classify-unpriced-cost.ts"

const pair = (provider: string, model: string, tokens = 1_000, calls = 10) => ({ provider, model, tokens, calls })

describe("classifyUnpricedPair", () => {
  it("reports a model the registry prices as an ingest gap", () => {
    expect(classifyUnpricedPair(pair("anthropic", "claude-sonnet-4-5")).cause).toBe("ingestGap")
  })

  it("reports an unknown model as missing pricing", () => {
    expect(classifyUnpricedPair(pair("acme-proxy", "our-own-llama")).cause).toBe("missingPricing")
  })
})

describe("summarizeUnpricedUsage", () => {
  it("keeps free models out of the gap figures", () => {
    const summary = summarizeUnpricedUsage({
      candidatePairs: [pair("acme-proxy", "our-own-llama", 400, 4)],
      billableTokens: 1_000,
    })

    expect(summary.gapTokens).toBe(400)
    expect(summary.gapPairCount).toBe(1)
    expect(summary.pricedCoverage).toBeCloseTo(0.6)
  })

  it("reads full coverage when nothing is unpriced", () => {
    const summary = summarizeUnpricedUsage({ candidatePairs: [], billableTokens: 1_000 })

    expect(summary.gapTokens).toBe(0)
    expect(summary.pricedCoverage).toBe(1)
  })

  it("has no coverage to report without billable tokens", () => {
    expect(summarizeUnpricedUsage({ candidatePairs: [], billableTokens: 0 }).pricedCoverage).toBeNull()
  })
})
