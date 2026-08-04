import { describe, expect, it } from "vitest"
import type { OtlpKeyValue } from "../../types.ts"
import { resolveUsage } from "../usage.ts"
import { cacheCreationTtlAttrKey, resolveUsageModifiers } from "./modifiers.ts"

function strAttr(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

function intAttr(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}

const MICROCENTS_PER_USD = 100_000_000

describe("resolveUsageModifiers", () => {
  it("reads the flat per-TTL cache-write split", () => {
    const attrs = [intAttr(cacheCreationTtlAttrKey(300), 148), intAttr(cacheCreationTtlAttrKey(3600), 100)]

    expect(resolveUsageModifiers(attrs).cacheCreateTokensByTtlSeconds).toEqual({ 300: 148, 3600: 100 })
  })

  it("drops zero and non-positive buckets", () => {
    const attrs = [intAttr(cacheCreationTtlAttrKey(300), 0), intAttr(cacheCreationTtlAttrKey(3600), 100)]

    expect(resolveUsageModifiers(attrs).cacheCreateTokensByTtlSeconds).toEqual({ 3600: 100 })
  })

  it("ignores keys under the prefix that do not name a duration", () => {
    const attrs = [intAttr("latitude.usage.cache_creation.ttl.1h", 100), intAttr("latitude.usage.cache_creation", 100)]

    expect(resolveUsageModifiers(attrs).cacheCreateTokensByTtlSeconds).toEqual({})
  })

  it("reads the tier from our own key and from the OpenAI attributes already in production", () => {
    expect(resolveUsageModifiers([strAttr("latitude.usage.service_tier", "fast")]).serviceTier).toBe("fast")
    expect(resolveUsageModifiers([strAttr("gen_ai.openai.response.service_tier", "flex")]).serviceTier).toBe("flex")
    expect(resolveUsageModifiers([strAttr("openai.response.service_tier", "priority")]).serviceTier).toBe("priority")
  })

  it("reads the inference region", () => {
    expect(resolveUsageModifiers([strAttr("latitude.usage.inference_geo", "us")]).inferenceGeo).toBe("us")
  })

  it("is empty for a span carrying none of them", () => {
    expect(resolveUsageModifiers([])).toEqual({
      serviceTier: "",
      inferenceGeo: "",
      cacheCreateTokensByTtlSeconds: {},
    })
  })
})

describe("resolveUsage with modifiers", () => {
  const baseAttrs = (): OtlpKeyValue[] => [
    strAttr("gen_ai.provider.name", "anthropic"),
    strAttr("gen_ai.request.model", "claude-opus-5"),
    intAttr("gen_ai.usage.input_tokens", 1_000),
    intAttr("gen_ai.usage.output_tokens", 1_000),
    intAttr("gen_ai.usage.cache_creation.input_tokens", 1_000_000),
  ]

  function usageOf(extra: OtlpKeyValue[] = []) {
    return resolveUsage({ attrs: [...baseAttrs(), ...extra], provider: "anthropic", model: "claude-opus-5" })
  }

  it("prices a span with no modifiers exactly as before, and stores them empty", () => {
    const usage = usageOf()

    expect(usage.tokensCacheCreate).toBe(1_000_000)
    expect(usage.tokensCacheCreateByTtlSeconds).toEqual({})
    expect(usage.serviceTier).toBe("")
    expect(usage.inferenceGeo).toBe("")
    // 1M cache writes at the catalog $6.25/MTok, plus 1k input at $5 and 1k output at $25.
    expect(usage.costInputMicrocents).toBe(Math.round((6.25 + 0.005) * MICROCENTS_PER_USD))
    expect(usage.costOutputMicrocents).toBe(Math.round(0.025 * MICROCENTS_PER_USD))
  })

  it("prices a 1h cache write at 2x base input and keeps the scalar total authoritative", () => {
    const usage = usageOf([intAttr(cacheCreationTtlAttrKey(3600), 1_000_000)])

    expect(usage.tokensCacheCreate).toBe(1_000_000)
    expect(usage.tokensCacheCreateByTtlSeconds).toEqual({ 3600: 1_000_000 })
    expect(usage.costInputMicrocents).toBe(Math.round((10 + 0.005) * MICROCENTS_PER_USD))
  })

  it("splits a mixed-TTL write", () => {
    const usage = usageOf([
      intAttr(cacheCreationTtlAttrKey(300), 500_000),
      intAttr(cacheCreationTtlAttrKey(3600), 500_000),
    ])

    expect(usage.costInputMicrocents).toBe(Math.round((6.25 / 2 + 10 / 2 + 0.005) * MICROCENTS_PER_USD))
  })

  it("stores the normalized tier and prices fast mode at 2x both sides", () => {
    const usage = usageOf([strAttr("latitude.usage.service_tier", "fast")])

    expect(usage.serviceTier).toBe("fast")
    expect(usage.costInputMicrocents).toBe(Math.round((6.25 + 0.005) * 2 * MICROCENTS_PER_USD))
    expect(usage.costOutputMicrocents).toBe(Math.round(0.025 * 2 * MICROCENTS_PER_USD))
  })

  it("normalizes a provider spelling that means the standard tier and prices it unchanged", () => {
    const standard = usageOf([strAttr("latitude.usage.service_tier", "default")])
    const bare = usageOf()

    expect(standard.serviceTier).toBe("standard")
    expect(standard.costInputMicrocents).toBe(bare.costInputMicrocents)
  })

  it("drops a tier spelling it does not recognize rather than storing noise", () => {
    const usage = usageOf([strAttr("latitude.usage.service_tier", "turbo")])

    expect(usage.serviceTier).toBe("")
  })

  it("adds 10% for us-only inference on every category", () => {
    const usage = usageOf([strAttr("latitude.usage.inference_geo", "us")])

    expect(usage.inferenceGeo).toBe("us")
    expect(usage.costInputMicrocents).toBe(Math.round((6.25 + 0.005) * 1.1 * MICROCENTS_PER_USD))
    expect(usage.costOutputMicrocents).toBe(Math.round(0.025 * 1.1 * MICROCENTS_PER_USD))
  })

  it("composes all three", () => {
    const usage = usageOf([
      strAttr("latitude.usage.service_tier", "fast"),
      strAttr("latitude.usage.inference_geo", "us"),
      intAttr(cacheCreationTtlAttrKey(3600), 1_000_000),
    ])

    expect(usage.costInputMicrocents).toBe(Math.round((20 + 0.01) * 1.1 * MICROCENTS_PER_USD))
  })

  it("leaves a provider-reported cost alone while still recording the modifiers", () => {
    const usage = usageOf([
      strAttr("latitude.usage.service_tier", "fast"),
      intAttr(cacheCreationTtlAttrKey(3600), 1_000_000),
      { key: "gen_ai.usage.input_cost", value: { doubleValue: 1 } },
      { key: "gen_ai.usage.output_cost", value: { doubleValue: 2 } },
    ])

    expect(usage.costSource).toBe("provider_reported")
    expect(usage.costInputMicrocents).toBe(MICROCENTS_PER_USD)
    expect(usage.serviceTier).toBe("fast")
    expect(usage.tokensCacheCreateByTtlSeconds).toEqual({ 3600: 1_000_000 })
  })
})
