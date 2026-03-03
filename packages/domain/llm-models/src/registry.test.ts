import { describe, expect, it } from "vitest"
import type { LlmModel } from "./entities/model.ts"
import {
  costBreakdownKey,
  estimateCost,
  estimateCostWithBreakdown,
  findModel,
  findModelWithFallback,
  formatModel,
  getAllModels,
  getCostSpec,
  getModelForProvider,
  getModelPricing,
  getModelsForProvider,
} from "./registry.ts"

const gpt4o: LlmModel = {
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

const claudeSonnet4: LlmModel = {
  id: "claude-sonnet-4-20250514",
  name: "Claude Sonnet 4",
  provider: "anthropic",
  pricing: { input: 3, output: 15, cacheRead: 0.3 },
}

const noPricing: LlmModel = {
  id: "no-pricing",
  name: "No Pricing Model",
  provider: "unknown",
}

const mockModels: LlmModel[] = [gpt4o, claudeSonnet4, noPricing]

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
})

describe("findModelWithFallback", () => {
  it("returns exact match first", () => {
    const model = findModelWithFallback(mockModels, "gpt-4o")
    expect(model?.id).toBe("gpt-4o")
  })

  it("falls back to longest prefix", () => {
    const models: LlmModel[] = [
      { id: "gpt-4", name: "GPT-4", provider: "openai" },
      { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    ]
    const model = findModelWithFallback(models, "gpt-4o-2024-11-20")
    expect(model?.id).toBe("gpt-4o")
  })

  it("returns undefined when no prefix matches", () => {
    expect(findModelWithFallback(mockModels, "totally-different")).toBeUndefined()
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

  it("returns null when input is zero (no meaningful pricing)", () => {
    const model: LlmModel = {
      id: "test",
      name: "Test",
      provider: "test",
      pricing: { input: 0, output: 10 },
    }
    expect(getModelPricing(model)).toBeNull()
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

  it("returns not-implemented for unknown model", () => {
    const result = getCostSpec("openai", "nonexistent-model-xyz")
    expect(result.costImplemented).toBe(false)
    expect(result.cost).toEqual({ input: 0, output: 0 })
  })

  it("returns not-implemented for unknown provider", () => {
    const result = getCostSpec("unknown-provider", "model")
    expect(result.costImplemented).toBe(false)
  })
})

describe("estimateCost", () => {
  it("computes cost for known provider/model", () => {
    const cost = estimateCost("openai", "gpt-4o", {
      promptTokens: 1000,
      completionTokens: 500,
    })
    expect(typeof cost).toBe("number")
    expect(cost).toBeGreaterThanOrEqual(0)
  })

  it("returns zero for unknown model", () => {
    const cost = estimateCost("openai", "nonexistent-xyz", {
      promptTokens: 1000,
      completionTokens: 500,
    })
    expect(cost).toBe(0)
  })

  it("handles NaN tokens gracefully", () => {
    const cost = estimateCost("openai", "gpt-4o", {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    })
    expect(cost).toBe(0)
  })
})

describe("estimateCostWithBreakdown", () => {
  it("returns a full breakdown", () => {
    const breakdown = estimateCostWithBreakdown("openai", "gpt-4o", {
      promptTokens: 2_000_000,
      completionTokens: 500_000,
      reasoningTokens: 100_000,
      cachedInputTokens: 300_000,
    })

    expect(breakdown.input.prompt.tokens).toBe(2_000_000)
    expect(breakdown.input.prompt.cost).toBeGreaterThan(0)
    expect(breakdown.output.completion.tokens).toBe(500_000)
    expect(breakdown.output.completion.cost).toBeGreaterThan(0)
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
