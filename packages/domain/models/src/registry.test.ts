import { describe, expect, it } from "vitest"
import { computeTokenCost } from "./entities/cost.ts"
import type { Model } from "./entities/model.ts"
import {
  costBreakdownKey,
  estimateCost,
  estimateCostWithBreakdown,
  findModel,
  formatModel,
  getAllModels,
  getCostSpec,
  getModelForProvider,
  getModelPricing,
  getModelsForProvider,
} from "./registry.ts"

const gpt4o: Model = {
  id: "gpt-4o",
  name: "GPT-4o",
  provider: "openai",
  pricing: { input: 2.5, output: 10 },
  contextLimit: 128000,
  outputLimit: 16384,
  toolCall: true,
  structuredOutput: true,
  supportsTemperature: true,
  modalities: { input: ["text", "image"], output: ["text"] },
  knowledgeCutoff: "2024-06-01",
}

const claudeSonnet4: Model = {
  id: "claude-sonnet-4-20250514",
  name: "Claude Sonnet 4",
  provider: "anthropic",
  pricing: { input: 3, output: 15, cacheRead: 0.3 },
}

const noPricing: Model = {
  id: "no-pricing",
  name: "No Pricing Model",
  provider: "unknown",
}

const mockModels: Model[] = [gpt4o, claudeSonnet4, noPricing]

describe("findModel", () => {
  it("finds model by exact ID", () => {
    const model = findModel(mockModels, "gpt-4o")
    expect(model?.id).toBe("gpt-4o")
  })

  it("finds model case-insensitively", () => {
    const model = findModel(mockModels, "GPT-4O")
    expect(model?.id).toBe("gpt-4o")
  })

  it("returns undefined when not found", () => {
    expect(findModel(mockModels, "nonexistent")).toBeUndefined()
  })

  it("falls back to longest prefix when no exact match", () => {
    const models: Model[] = [
      { id: "gpt-4", name: "GPT-4", provider: "openai" },
      { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    ]
    const model = findModel(models, "gpt-4o-2024-11-20")
    expect(model?.id).toBe("gpt-4o")
  })

  it("returns undefined when no prefix matches either", () => {
    expect(findModel(mockModels, "totally-different")).toBeUndefined()
  })
})

describe("getModelPricing", () => {
  it("returns pricing when available", () => {
    const pricing = getModelPricing(gpt4o)
    expect(pricing).toEqual({ input: 2.5, output: 10 })
  })

  it("returns null when pricing is missing", () => {
    expect(getModelPricing(noPricing)).toBeNull()
  })

  // A zero on one side is a real rate, not absent pricing: embeddings charge for input only, and
  // some models bill output only. Treating either as unpriced threw away the side we do know.
  it.each([
    ["input", { input: 0, output: 10 }],
    ["output", { input: 0.02, output: 0 }],
  ])("keeps pricing when the %s rate is zero", (_side, pricing) => {
    const model: Model = { id: "test", name: "Test", provider: "test", pricing }
    expect(getModelPricing(model)).toEqual(pricing)
  })
})

describe("getModelsForProvider", () => {
  it("returns models for a known provider from bundled data", () => {
    const models = getModelsForProvider("openai")
    expect(models.length).toBeGreaterThan(0)
    expect(models.every((m) => m.provider.toLowerCase() === "openai")).toBe(true)
  })

  it("is case-insensitive", () => {
    const lower = getModelsForProvider("openai")
    const upper = getModelsForProvider("OpenAI")
    expect(lower).toEqual(upper)
  })

  it("returns empty array for unknown provider", () => {
    expect(getModelsForProvider("nonexistent-provider-xyz")).toEqual([])
  })

  it("resolves provider aliases", () => {
    const models = getModelsForProvider("amazon_bedrock")
    expect(models.length).toBeGreaterThanOrEqual(0)
  })
})

describe("getModelForProvider", () => {
  it("finds a model for a provider", () => {
    const model = getModelForProvider("openai", "gpt-4o")
    expect(model).toBeDefined()
    expect(model?.id).toBe("gpt-4o")
  })

  it("returns undefined for unknown model in known provider", () => {
    const model = getModelForProvider("openai", "nonexistent-model-xyz")
    expect(model).toBeUndefined()
  })

  it("finds Bedrock model with regional prefix by falling back to stripped ID", () => {
    const base = getModelForProvider("amazon_bedrock", "amazon.nova-micro-v1:0")
    expect(base).toBeDefined()

    // Regional prefixed IDs should resolve to the same base model
    const eu = getModelForProvider("amazon_bedrock", "eu.amazon.nova-micro-v1:0")
    const us = getModelForProvider("amazon_bedrock", "us.amazon.nova-micro-v1:0")
    const apac = getModelForProvider("amazon_bedrock", "apac.amazon.nova-micro-v1:0")

    expect(eu?.id).toBe(base?.id)
    expect(us?.id).toBe(base?.id)
    expect(apac?.id).toBe(base?.id)
  })

  it("resolves a bare Bedrock model id missing the vendor prefix to the base entry", () => {
    const base = getModelForProvider("amazon_bedrock", "anthropic.claude-opus-4-8")
    expect(base).toBeDefined()

    // Instrumentations may strip both the region and the vendor prefix.
    const bare = getModelForProvider("amazon_bedrock", "claude-opus-4-8")
    expect(bare?.id).toBe(base?.id)
    expect(getCostSpec("amazon-bedrock", "claude-opus-4-8").costImplemented).toBe(true)
  })

  it("does not strip regional prefix for non-Bedrock providers", () => {
    const model = getModelForProvider("openai", "eu.gpt-4o")
    expect(model).toBeUndefined()
  })

  it("prices the Vercel AI Gateway's own model ids under the gateway provider", () => {
    expect(getModelForProvider("gateway", "xai/grok-4.5")?.id).toBe("xai/grok-4.5")
    expect(getCostSpec("gateway", "xai/grok-4.5").costImplemented).toBe(true)
  })

  it("ignores a vendor prefix that names the provider it was reported under", () => {
    expect(getModelForProvider("openai", "openai/gpt-5.4")?.id).toBe("gpt-5.4")
    expect(getCostSpec("openai", "openai/gpt-5.4")).toEqual(getCostSpec("openai", "gpt-5.4"))
  })

  // A router or billing label prices nothing itself, so the vendor in the slug is asked instead.
  it("prices a slug by its vendor when the reported provider is an unknown label", () => {
    expect(getModelForProvider("stripe", "openai/gpt-5.4")?.id).toBe("gpt-5.4")
    expect(getCostSpec("stripe", "openai/gpt-5.4")).toEqual(getCostSpec("openai", "gpt-5.4"))
  })

  // A provider the catalog knows is a real host. Missing the model means we have no price for what it
  // serves, not that the slug's vendor served it — the same reason a proxied bare id stays unpriced.
  it("does not let the slug vendor answer for a known provider that lacks the model", () => {
    expect(getModelsForProvider("openai").length).toBeGreaterThan(0)
    expect(getModelForProvider("openai", "deepseek/deepseek-v4-flash")).toBeUndefined()
    expect(getCostSpec("openai", "deepseek/deepseek-v4-flash").costImplemented).toBe(false)

    expect(getCostSpec("deepseek", "deepseek-v4-flash").costImplemented).toBe(true)
  })

  it("prefers the reported provider over the slug vendor when it lists the model", () => {
    expect(getModelForProvider("gateway", "xai/grok-4.5")?.provider).toBe("vercel")
  })

  // Only a vendor that lists the model itself can price it. Anything else is open-weights territory,
  // where hosts charge wildly different rates and the vendor cannot stand in for whoever served it.
  it.each([
    ["a vendor that does not list the model", "z-ai/glm-5.2"],
    ["a vendor nobody knows", "nonsense/made-up-model"],
  ])("leaves a slug unpriced when the prefix names %s", (_case, modelId) => {
    expect(getModelForProvider("some-router", modelId)).toBeUndefined()
    expect(getCostSpec("some-router", modelId).costImplemented).toBe(false)
  })

  // The vendor is asked for this model, not for its nearest relative. Each of these names a real
  // vendor that sells a model whose id is a leading substring, at a rate that is not this model's.
  it.each([
    ["a newer generation the vendor does not list", "openai/gpt-5.3-instant"],
    ["a distinct product tier", "openai/o3-deep-research"],
    ["a free variant of a paid model", "anthropic/claude-sonnet-5-free"],
  ])("does not price %s from a neighbouring model", (_case, modelId) => {
    expect(getModelForProvider("some-router", modelId)).toBeUndefined()
    expect(getCostSpec("some-router", modelId).costImplemented).toBe(false)
  })

  // The provider is ours, not the customer's: Claude Code spans carry no provider attribute, so
  // ingestion assumes `anthropic`. A proxied bare model id must stay unpriced rather than take
  // Anthropic's rates.
  it("does not price a non-Anthropic bare model id assumed to be Anthropic", () => {
    expect(getModelForProvider("anthropic", "qwen3.7-max")).toBeUndefined()
    expect(getCostSpec("anthropic", "qwen3.7-max").costImplemented).toBe(false)
  })
})

// Every provider/model pair observed recording no cost in production on 2026-07-29, with the reason
// each one resolves the way it does. Pairs left unpriced are deliberate, not gaps waiting to close.
describe("getCostSpec against production pairs that recorded no cost", () => {
  it.each([
    ["openai", "openai/gpt-5.4", "vendor prefix duplicates the provider"],
    ["stripe", "openai/gpt-5.4", "billing label prices nothing; the slug vendor does"],
    ["gateway", "xai/grok-4.5", "Vercel AI Gateway slug"],
    ["gateway", "openai/gpt-5.4-mini", "Vercel AI Gateway slug"],
    ["gateway", "openai/gpt-4.1-mini", "Vercel AI Gateway slug"],
    ["xai-oauth", "grok-4.5", "provider naming variant"],
    ["openai", "text-embedding-3-small", "embeddings price input only"],
  ])("prices %s / %s (%s)", (provider, model) => {
    expect(getCostSpec(provider, model).costImplemented).toBe(true)
  })

  it.each([
    ["anthropic", "qwen3.7-max", "Claude Code assumes anthropic; a proxied model has no known rate"],
    ["nous", "stepfun/step-3.7-flash:free", "the router listing this free tier is not the slug vendor"],
    ["kimi-coding", "kimi-k3", "flat-rate coding plan, so a per-token rate is wrong in kind"],
    ["custom", "groq-llama70b", "user-named provider and model"],
    ["custom", "local-fast", "user-named provider and model"],
  ])("leaves %s / %s unpriced (%s)", (provider, model) => {
    expect(getCostSpec(provider, model).costImplemented).toBe(false)
  })

  // A free tier is priced only where the catalog lists it, which is the router serving it. The slug's
  // vendor lists the paid model under the unmodified id, and must not answer for the free variant.
  it("takes a free tier's price from the catalog rather than the naming convention", () => {
    expect(getCostSpec("unorouter", "step-3.7-flash:free")).toEqual({
      cost: { input: 0, output: 0 },
      costImplemented: true,
      pricedProvider: "unorouter",
      pricedModel: "step-3.7-flash:free",
    })

    expect(computeTokenCost(getCostSpec("stepfun", "step-3.7-flash").cost, 1_000_000, "input")).toBeGreaterThan(0)
    expect(getModelForProvider("stepfun", "step-3.7-flash:free")).toBeUndefined()
  })

  // What priced a span is not recoverable from the reported pair, so the lookup reports both sides
  // separately: either can differ from what was reported, and a dated model id resolves to its base.
  it.each([
    ["stripe", "openai/gpt-5.4", "openai", "gpt-5.4"],
    ["gateway", "xai/grok-4.5", "vercel", "xai/grok-4.5"],
    ["nous", "x-ai/grok-4.5", "xai", "grok-4.5"],
    ["xai-oauth", "grok-4.5", "xai", "grok-4.5"],
    ["openai", "gpt-4.1-2025-04-14", "openai", "gpt-4.1"],
  ])("reports the catalog entry that priced %s / %s", (provider, model, pricedProvider, pricedModel) => {
    const spec = getCostSpec(provider, model)
    expect(spec.pricedProvider).toBe(pricedProvider)
    expect(spec.pricedModel).toBe(pricedModel)
  })

  it("reports no catalog entry when nothing priced the pair", () => {
    const spec = getCostSpec("anthropic", "qwen3.7-max")
    expect(spec.pricedProvider).toBe("")
    expect(spec.pricedModel).toBe("")
  })

  it("keeps an embedding model's input price instead of discarding it", () => {
    const { cost, costImplemented } = getCostSpec("openai", "text-embedding-3-small")
    expect(costImplemented).toBe(true)
    expect(computeTokenCost(cost, 1_000_000, "input")).toBeGreaterThan(0)
    expect(computeTokenCost(cost, 1_000_000, "output")).toBe(0)
  })
})

describe("getAllModels", () => {
  it("returns a non-empty list of models from bundled data", () => {
    const models = getAllModels()
    expect(Array.isArray(models)).toBe(true)
    expect(models.length).toBeGreaterThan(0)
  })

  it("returns cached result on subsequent calls", () => {
    const first = getAllModels()
    const second = getAllModels()
    expect(first).toBe(second)
  })
})

describe("getCostSpec", () => {
  it("returns implemented cost for a known model", () => {
    const result = getCostSpec("openai", "gpt-4o")
    expect(result.costImplemented).toBe(true)
    expect(result.cost).toHaveProperty("input")
    expect(result.cost).toHaveProperty("output")
  })

  it("normalizes Vercel provider suffixes for cost lookup", () => {
    const result = getCostSpec("openai.responses", "gpt-4o")
    expect(result.costImplemented).toBe(true)
    expect(result.cost).toHaveProperty("input")
    expect(result.cost).toHaveProperty("output")
  })

  it("returns not-implemented for unknown model", () => {
    const result = getCostSpec("openai", "nonexistent-model-xyz")
    expect(result.costImplemented).toBe(false)
    expect(result.cost).toEqual({ input: 0, output: 0 })
  })

  it("returns not-implemented for unknown provider", () => {
    const result = getCostSpec("unknown-provider", "model")
    expect(result.costImplemented).toBe(false)
  })

  it("resolves openai-codex provider to openai for pricing lookup", () => {
    const codex = getCostSpec("openai-codex", "gpt-5-codex")
    const openai = getCostSpec("openai", "gpt-5-codex")
    expect(codex.costImplemented).toBe(true)
    expect(codex).toEqual(openai)
  })
})

describe("estimateCost", () => {
  it("computes cost for known provider/model", () => {
    const cost = estimateCost("openai", "gpt-4o", {
      input: 1000,
      output: 500,
    })
    expect(typeof cost).toBe("number")
    expect(cost).toBeGreaterThanOrEqual(0)
  })

  it("returns zero for unknown model", () => {
    const cost = estimateCost("openai", "nonexistent-xyz", {
      input: 1000,
      output: 500,
    })
    expect(cost).toBe(0)
  })

  it("handles NaN tokens gracefully", () => {
    const cost = estimateCost("openai", "gpt-4o", {
      input: Number.NaN,
      output: Number.NaN,
    })
    expect(cost).toBe(0)
  })
})

describe("estimateCostWithBreakdown", () => {
  it("returns a full breakdown", () => {
    const breakdown = estimateCostWithBreakdown("openai", "gpt-4o", {
      input: 2_000_000,
      output: 500_000,
      reasoning: 100_000,
      cacheRead: 300_000,
    })

    expect(breakdown.input.direct.tokens).toBe(2_000_000)
    expect(breakdown.input.direct.cost).toBeGreaterThan(0)
    expect(breakdown.output.direct.tokens).toBe(500_000)
    expect(breakdown.output.direct.cost).toBeGreaterThan(0)
  })
})

describe("costBreakdownKey", () => {
  it("combines provider and model with slash", () => {
    expect(costBreakdownKey("openai", "gpt-4o")).toBe("openai/gpt-4o")
  })
})

describe("formatModel", () => {
  it("includes model name and id", () => {
    const formatted = formatModel(gpt4o)
    expect(formatted).toContain("GPT-4o")
    expect(formatted).toContain("gpt-4o")
  })

  it("includes context window", () => {
    const formatted = formatModel(gpt4o)
    expect(formatted).toContain("Context window")
    expect(formatted).toContain("128K")
  })

  it("includes pricing", () => {
    const formatted = formatModel(gpt4o)
    expect(formatted).toContain("Pricing (per 1M tokens)")
    expect(formatted).toContain("$2.50")
    expect(formatted).toContain("$10.00")
  })

  it("includes modalities", () => {
    const formatted = formatModel(gpt4o)
    expect(formatted).toContain("Input modalities: text, image")
    expect(formatted).toContain("Output modalities: text")
  })

  it("includes features", () => {
    const formatted = formatModel(gpt4o)
    expect(formatted).toContain("tool calling")
    expect(formatted).toContain("structured output")
  })

  it("includes knowledge cutoff", () => {
    const formatted = formatModel(gpt4o)
    expect(formatted).toContain("Knowledge cutoff: 2024-06-01")
  })

  it("handles model with no optional fields", () => {
    const formatted = formatModel(noPricing)
    expect(formatted).toContain("No Pricing Model")
    expect(formatted).toContain("no-pricing")
  })
})

describe("getCostSpec bare model ids on namespaced providers", () => {
  // OpenRouter's API takes `grok-4.5` while its catalog keys on `x-ai/grok-4.5`. The rate we
  // resolve is OpenRouter's own, so this borrows nothing from another host.
  it("prices a bare id against the reported provider's own namespaced entry", () => {
    const result = getCostSpec("openrouter", "grok-4.5")

    expect(result.costImplemented).toBe(true)
    expect(result.pricedProvider).toBe("openrouter")
    expect(result.pricedModel).toBe("x-ai/grok-4.5")
  })

  it("leaves a bare id unpriced when two vendors on that provider share the name", () => {
    const models: Model[] = [
      { id: "vendor-a/shared-model", provider: "acme", name: "A", pricing: { input: 1, output: 2 } } as Model,
      { id: "vendor-b/shared-model", provider: "acme", name: "B", pricing: { input: 9, output: 9 } } as Model,
    ]
    // Two different models at two different rates: picking one would invent a number.
    expect(findModel(models, "shared-model")).toBeUndefined()
  })

  it("does not reach into another provider's catalog for a model the reported one lacks", () => {
    // Anthropic does not sell Qwen; a proxy reporting `anthropic` gets no price, by design.
    expect(getCostSpec("anthropic", "qwen3.7-max").costImplemented).toBe(false)
  })
})

describe("getCostSpec fireworks provider alias", () => {
  it("resolves the bare `fireworks` provider id to models.dev's `fireworks-ai`", () => {
    const result = getCostSpec("fireworks", "accounts/fireworks/models/qwen3p7-plus")

    expect(result.costImplemented).toBe(true)
    expect(result.pricedProvider).toBe("fireworks-ai")
  })

  it("resolves the Vercel-suffixed `fireworks.chat` too", () => {
    expect(getCostSpec("fireworks.chat", "accounts/fireworks/models/qwen3p7-plus").costImplemented).toBe(true)
  })
})
