import { describe, expect, it } from "vitest"
import { toTokenAnalytics } from "./token-analytics.ts"

describe("toTokenAnalytics", () => {
  it("computes a token-weighted cache hit rate over the summed tokens", () => {
    const result = toTokenAnalytics({
      tokens_input_sum: "10",
      tokens_output_sum: "5",
      tokens_cache_read_sum: "80",
      tokens_cache_create_sum: "10",
    })
    // 80 / (10 + 80 + 10) = 0.8
    expect(result.cacheHitRate).toBe(0.8)
    expect(result).toMatchObject({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 80, cacheCreateTokens: 10 })
  })

  it("returns a null rate when there are no input-side tokens", () => {
    const result = toTokenAnalytics({
      tokens_input_sum: "0",
      tokens_output_sum: "0",
      tokens_cache_read_sum: "0",
      tokens_cache_create_sum: "0",
    })
    expect(result.cacheHitRate).toBeNull()
  })
})
