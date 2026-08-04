import { describe, expect, it } from "vitest"
import {
  cacheWriteTtlMultiplier,
  cacheWriteTtlSource,
  estimateModifiedCost,
  inferenceGeoMultiplier,
  parseInferenceGeo,
  parseServiceTier,
  purchasablePromptCacheTtlSeconds,
  serviceTierMultiplier,
} from "./cost-multipliers.ts"
import { estimateTotalCost } from "./entities/cost.ts"
import { getCostSpec } from "./registry.ts"

const OPUS_5 = getCostSpec("anthropic", "claude-opus-5").cost
const MTOK = 1_000_000

const noTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }

describe("parseServiceTier", () => {
  it("normalizes provider spellings onto one tier", () => {
    expect(parseServiceTier("fast")).toBe("fast")
    expect(parseServiceTier("standard")).toBe("standard")
    expect(parseServiceTier("default")).toBe("standard")
    expect(parseServiceTier("auto")).toBe("standard")
    expect(parseServiceTier("Priority")).toBe("priority")
    expect(parseServiceTier("scale")).toBe("priority")
  })

  it("rejects anything it does not recognize", () => {
    expect(parseServiceTier("")).toBeNull()
    expect(parseServiceTier("turbo")).toBeNull()
  })
})

describe("parseInferenceGeo", () => {
  it("accepts the documented regions only", () => {
    expect(parseInferenceGeo("us")).toBe("us")
    expect(parseInferenceGeo("global")).toBe("global")
    expect(parseInferenceGeo("eu")).toBeNull()
    expect(parseInferenceGeo("")).toBeNull()
  })
})

describe("serviceTierMultiplier", () => {
  it("doubles fast mode on the models Anthropic offers it for", () => {
    expect(serviceTierMultiplier({ provider: "anthropic", model: "claude-opus-5", serviceTier: "fast" })).toBe(2)
    expect(serviceTierMultiplier({ provider: "anthropic", model: "claude-opus-4-8", serviceTier: "fast" })).toBe(2)
  })

  it("leaves fast mode on other models at the catalog rate", () => {
    expect(serviceTierMultiplier({ provider: "anthropic", model: "claude-sonnet-5", serviceTier: "fast" })).toBe(1)
    expect(serviceTierMultiplier({ provider: "openai", model: "gpt-5.6", serviceTier: "fast" })).toBe(1)
  })

  it("halves batch and ignores tiers with no sourced rate", () => {
    expect(serviceTierMultiplier({ provider: "anthropic", model: "claude-opus-5", serviceTier: "batch" })).toBe(0.5)
    expect(serviceTierMultiplier({ provider: "openai", model: "gpt-5.6", serviceTier: "batch" })).toBe(0.5)
    expect(serviceTierMultiplier({ provider: "anthropic", model: "claude-opus-5", serviceTier: "priority" })).toBe(1)
  })

  it("is 1.0 when absent", () => {
    expect(serviceTierMultiplier({ provider: "anthropic", model: "claude-opus-5" })).toBe(1)
    expect(serviceTierMultiplier({ provider: "anthropic", model: "claude-opus-5", serviceTier: "" })).toBe(1)
  })
})

describe("inferenceGeoMultiplier", () => {
  it("adds 10% for us-only inference", () => {
    expect(inferenceGeoMultiplier({ provider: "anthropic", inferenceGeo: "us" })).toBe(1.1)
  })

  it("is 1.0 for global, for other providers, and when absent", () => {
    expect(inferenceGeoMultiplier({ provider: "anthropic", inferenceGeo: "global" })).toBe(1)
    expect(inferenceGeoMultiplier({ provider: "openai", inferenceGeo: "us" })).toBe(1)
    expect(inferenceGeoMultiplier({ provider: "anthropic" })).toBe(1)
  })
})

describe("cacheWriteTtlMultiplier", () => {
  it("reproduces the published per-model 1h write price from the catalog rate", () => {
    const pairs = [
      ["claude-opus-5", 6.25, 10],
      ["claude-sonnet-5", 2.5, 4],
      ["claude-fable-5", 12.5, 20],
      ["claude-haiku-4-5", 1.25, 2],
    ] as const

    for (const [model, catalogWrite, published1h] of pairs) {
      const { cost } = getCostSpec("anthropic", model)
      expect(Array.isArray(cost) ? undefined : cost.cacheWrite).toBe(catalogWrite)
      const factor = cacheWriteTtlMultiplier({ provider: "anthropic", model, ttlSeconds: 3600 })
      expect(catalogWrite * factor).toBeCloseTo(published1h, 10)
    }
  })

  it("leaves the default lifetime and unknown lifetimes at the catalog rate", () => {
    expect(cacheWriteTtlMultiplier({ provider: "anthropic", model: "claude-opus-5", ttlSeconds: 300 })).toBe(1)
    expect(cacheWriteTtlMultiplier({ provider: "anthropic", model: "claude-opus-5", ttlSeconds: 86_400 })).toBe(1)
    expect(cacheWriteTtlMultiplier({ provider: "openai", model: "gpt-5.6", ttlSeconds: 3600 })).toBe(1)
  })

  it("cites its source only for lifetimes it covers", () => {
    expect(cacheWriteTtlSource({ provider: "anthropic", model: "claude-opus-5", ttlSeconds: 3600 })).toContain(
      "prompt-caching",
    )
    expect(cacheWriteTtlSource({ provider: "openai", model: "gpt-5.6", ttlSeconds: 3600 })).toBeNull()
  })
})

describe("purchasablePromptCacheTtlSeconds", () => {
  it("lists the lifetimes Anthropic sells, and nothing for providers that sell no choice", () => {
    expect(purchasablePromptCacheTtlSeconds({ provider: "anthropic", model: "claude-opus-5" })).toEqual([300, 3600])
    expect(purchasablePromptCacheTtlSeconds({ provider: "openai", model: "gpt-5.6" })).toEqual([])
  })
})

describe("estimateModifiedCost", () => {
  it("prices byte-identically to the catalog when no modifier is present", () => {
    const tokens = { input: 1_000, output: 2_000, cacheRead: 30_000, cacheWrite: 4_000, reasoning: 500 }

    const modified = estimateModifiedCost({ cost: OPUS_5, provider: "anthropic", model: "claude-opus-5", tokens })
    const catalog = estimateTotalCost(OPUS_5, {
      input: tokens.input,
      output: tokens.output,
      cacheRead: tokens.cacheRead,
      cacheWrite: tokens.cacheWrite,
      reasoning: tokens.reasoning,
    })

    expect(modified.inputUsd + modified.outputUsd).toBe(catalog)
  })

  it("prices byte-identically when the modifiers are present but standard", () => {
    const tokens = { input: 1_000, output: 2_000, cacheRead: 30_000, cacheWrite: 4_000, reasoning: 500 }
    const bare = estimateModifiedCost({ cost: OPUS_5, provider: "anthropic", model: "claude-opus-5", tokens })

    const explicit = estimateModifiedCost({
      cost: OPUS_5,
      provider: "anthropic",
      model: "claude-opus-5",
      tokens,
      modifiers: { serviceTier: "standard", inferenceGeo: "global" },
    })

    expect(explicit).toEqual(bare)
  })

  it("splits a mixed-TTL write between the 5m and 1h rates", () => {
    const tokens = { ...noTokens, cacheWrite: 248 }

    const { inputUsd } = estimateModifiedCost({
      cost: OPUS_5,
      provider: "anthropic",
      model: "claude-opus-5",
      tokens,
      modifiers: { cacheCreateTokensByTtlSeconds: { 300: 148, 3600: 100 } },
    })

    // 148 tok at $6.25/MTok + 100 tok at $10/MTok
    expect(inputUsd).toBeCloseTo((148 * 6.25 + 100 * 10) / MTOK, 12)
  })

  it("prices an all-1h write at exactly the published 1h rate", () => {
    const { inputUsd } = estimateModifiedCost({
      cost: OPUS_5,
      provider: "anthropic",
      model: "claude-opus-5",
      tokens: { ...noTokens, cacheWrite: MTOK },
      modifiers: { cacheCreateTokensByTtlSeconds: { 3600: MTOK } },
    })

    expect(inputUsd).toBeCloseTo(10, 10)
  })

  it("bills the unsplit remainder of a partial split at the catalog rate", () => {
    const { inputUsd } = estimateModifiedCost({
      cost: OPUS_5,
      provider: "anthropic",
      model: "claude-opus-5",
      tokens: { ...noTokens, cacheWrite: 1_000 },
      modifiers: { cacheCreateTokensByTtlSeconds: { 3600: 400 } },
    })

    expect(inputUsd).toBeCloseTo((400 * 10 + 600 * 6.25) / MTOK, 12)
  })

  it("uses the split alone when it disagrees with the reported total", () => {
    const { inputUsd } = estimateModifiedCost({
      cost: OPUS_5,
      provider: "anthropic",
      model: "claude-opus-5",
      tokens: { ...noTokens, cacheWrite: 100 },
      modifiers: { cacheCreateTokensByTtlSeconds: { 3600: 400 } },
    })

    // The reported scalar still sets the token count; only the rate comes from the split.
    expect(inputUsd).toBeCloseTo((100 * 10) / MTOK, 12)
  })

  it("scales every category by fast mode", () => {
    const tokens = { input: MTOK, output: MTOK, cacheRead: MTOK, cacheWrite: MTOK, reasoning: 0 }

    const { inputUsd, outputUsd } = estimateModifiedCost({
      cost: OPUS_5,
      provider: "anthropic",
      model: "claude-opus-5",
      tokens,
      modifiers: { serviceTier: "fast" },
    })

    // Fast mode replaces the base: $10 in / $50 out, so cache read is 0.1 x $10 and write 1.25 x $10.
    expect(inputUsd).toBeCloseTo(10 + 1 + 12.5, 10)
    expect(outputUsd).toBeCloseTo(50, 10)
  })

  it("composes fast mode with a 1h cache write", () => {
    const { inputUsd } = estimateModifiedCost({
      cost: OPUS_5,
      provider: "anthropic",
      model: "claude-opus-5",
      tokens: { ...noTokens, cacheWrite: MTOK },
      modifiers: { serviceTier: "fast", cacheCreateTokensByTtlSeconds: { 3600: MTOK } },
    })

    // 2 x base input ($10) written for an hour at 2x = $20/MTok.
    expect(inputUsd).toBeCloseTo(20, 10)
  })

  it("composes us-only inference with fast mode and a mixed-TTL write", () => {
    const tokens = { input: MTOK, output: MTOK, cacheRead: 0, cacheWrite: MTOK, reasoning: 0 }

    const { inputUsd, outputUsd } = estimateModifiedCost({
      cost: OPUS_5,
      provider: "anthropic",
      model: "claude-opus-5",
      tokens,
      modifiers: {
        serviceTier: "fast",
        inferenceGeo: "us",
        cacheCreateTokensByTtlSeconds: { 300: MTOK / 2, 3600: MTOK / 2 },
      },
    })

    // input 2x1.1x$5, write half at 1.25x and half at 2x of the 2x base, all x1.1
    expect(inputUsd).toBeCloseTo((10 + (6.25 + 10)) * 1.1, 10)
    expect(outputUsd).toBeCloseTo(50 * 1.1, 10)
  })

  it("ignores a split whose buckets are all zero", () => {
    const tokens = { ...noTokens, cacheWrite: 1_000 }
    const bare = estimateModifiedCost({ cost: OPUS_5, provider: "anthropic", model: "claude-opus-5", tokens })

    const split = estimateModifiedCost({
      cost: OPUS_5,
      provider: "anthropic",
      model: "claude-opus-5",
      tokens,
      modifiers: { cacheCreateTokensByTtlSeconds: { 300: 0, 3600: 0 } },
    })

    expect(split).toEqual(bare)
  })
})
