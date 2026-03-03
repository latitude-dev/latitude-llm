import { describe, expect, it } from "vitest"
import type { Model } from "../entities/model.ts"
import { findModel, formatModel, getModelPricing } from "./find-model.ts"

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

const noPricing: Model = {
  id: "no-pricing",
  name: "No Pricing Model",
  provider: "unknown",
}

const mockModels: Model[] = [
  gpt4o,
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    pricing: { input: 3, output: 15, cacheRead: 0.3 },
  },
  noPricing,
]

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

  it("returns null when input is zero (no meaningful pricing)", () => {
    const model: Model = {
      id: "test",
      name: "Test",
      provider: "test",
      pricing: { input: 0, output: 10 },
    }
    expect(getModelPricing(model)).toBeNull()
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
