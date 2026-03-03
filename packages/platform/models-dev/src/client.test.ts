import { afterEach, describe, expect, it } from "vitest"
import {
  clearCache,
  costBreakdownKey,
  estimateCost,
  estimateCostWithBreakdown,
  getAllModels,
  getCostSpec,
  getModelForProvider,
  getModelsForProvider,
} from "./client.ts"

afterEach(() => {
  clearCache()
})

describe("getAllModels", () => {
  it("returns a non-empty list of models", async () => {
    const models = await getAllModels()
    expect(Array.isArray(models)).toBe(true)
    expect(models.length).toBeGreaterThan(0)
  })

  it("returns cached result on subsequent calls", async () => {
    const first = await getAllModels()
    const second = await getAllModels()
    expect(first).toBe(second)
  })
})

describe("getModelsForProvider", () => {
  it("returns models for a known provider", async () => {
    const models = await getModelsForProvider("openai")
    expect(models.length).toBeGreaterThan(0)
    expect(models.every((m) => m.provider.toLowerCase() === "openai")).toBe(true)
  })

  it("is case-insensitive", async () => {
    const lower = await getModelsForProvider("openai")
    const upper = await getModelsForProvider("OpenAI")
    expect(lower).toEqual(upper)
  })

  it("returns empty array for unknown provider", async () => {
    expect(await getModelsForProvider("nonexistent-provider-xyz")).toEqual([])
  })

  it("resolves provider aliases", async () => {
    const models = await getModelsForProvider("amazon_bedrock")
    expect(models.length).toBeGreaterThanOrEqual(0)
  })
})

describe("getModelForProvider", () => {
  it("finds a model for a provider", async () => {
    const model = await getModelForProvider("openai", "gpt-4o")
    expect(model).toBeDefined()
    expect(model?.id).toBe("gpt-4o")
  })

  it("returns undefined for unknown model", async () => {
    const model = await getModelForProvider("openai", "nonexistent-model-xyz")
    expect(model).toBeUndefined()
  })
})

describe("getCostSpec", () => {
  it("returns implemented cost for a known model", async () => {
    const result = await getCostSpec("openai", "gpt-4o")
    expect(result.costImplemented).toBe(true)
    expect(result.cost).toHaveProperty("input")
    expect(result.cost).toHaveProperty("output")
  })

  it("returns not-implemented for unknown model", async () => {
    const result = await getCostSpec("openai", "nonexistent-model-xyz")
    expect(result.costImplemented).toBe(false)
    expect(result.cost).toEqual({ input: 0, output: 0 })
  })

  it("returns not-implemented for unknown provider", async () => {
    const result = await getCostSpec("unknown-provider", "model")
    expect(result.costImplemented).toBe(false)
  })
})

describe("estimateCost", () => {
  it("computes cost for known provider/model", async () => {
    const cost = await estimateCost("openai", "gpt-4o", {
      input: 1000,
      output: 500,
    })
    expect(typeof cost).toBe("number")
    expect(cost).toBeGreaterThanOrEqual(0)
  })

  it("returns zero for unknown model", async () => {
    const cost = await estimateCost("openai", "nonexistent-xyz", {
      input: 1000,
      output: 500,
    })
    expect(cost).toBe(0)
  })

  it("handles NaN tokens gracefully", async () => {
    const cost = await estimateCost("openai", "gpt-4o", {
      input: Number.NaN,
      output: Number.NaN,
    })
    expect(cost).toBe(0)
  })
})

describe("estimateCostWithBreakdown", () => {
  it("returns a full breakdown", async () => {
    const breakdown = await estimateCostWithBreakdown("openai", "gpt-4o", {
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
