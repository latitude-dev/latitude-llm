import { describe, expect, it } from "vitest"
import type { Model } from "../entities/model.ts"
import type { ModelRepository } from "../ports/model-repository.ts"
import { createCostEstimator } from "./estimate-cost.ts"

const fakeModels: Model[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    pricing: { input: 2.5, output: 10 },
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    pricing: { input: 3, output: 15, cacheRead: 0.3 },
  },
]

const fakeRepository: ModelRepository = {
  getAllModels: async () => fakeModels,
}

const estimator = createCostEstimator(fakeRepository)

describe("createCostEstimator", () => {
  describe("getModelsForProvider", () => {
    it("returns models for a known provider", async () => {
      const models = await estimator.getModelsForProvider("openai")
      expect(models).toHaveLength(1)
      expect(models[0]?.id).toBe("gpt-4o")
    })

    it("resolves provider aliases", async () => {
      const models = await estimator.getModelsForProvider("amazon_bedrock")
      expect(models).toEqual([])
    })

    it("returns empty for unknown provider", async () => {
      const models = await estimator.getModelsForProvider("nonexistent")
      expect(models).toEqual([])
    })
  })

  describe("getModelForProvider", () => {
    it("finds a model", async () => {
      const model = await estimator.getModelForProvider("openai", "gpt-4o")
      expect(model?.id).toBe("gpt-4o")
    })

    it("returns undefined for unknown model", async () => {
      const model = await estimator.getModelForProvider("openai", "nonexistent")
      expect(model).toBeUndefined()
    })
  })

  describe("getCostSpec", () => {
    it("returns implemented cost for known model", async () => {
      const result = await estimator.getCostSpec("openai", "gpt-4o")
      expect(result.costImplemented).toBe(true)
      expect(result.cost).toHaveProperty("input")
      expect(result.cost).toHaveProperty("output")
    })

    it("returns not-implemented for unknown model", async () => {
      const result = await estimator.getCostSpec("openai", "nonexistent")
      expect(result.costImplemented).toBe(false)
      expect(result.cost).toEqual({ input: 0, output: 0 })
    })
  })

  describe("estimateCost", () => {
    it("computes cost for known model", async () => {
      const cost = await estimator.estimateCost("openai", "gpt-4o", {
        input: 1_000_000,
        output: 500_000,
      })
      expect(cost).toBeCloseTo(2.5 + 5)
    })

    it("returns zero for unknown model", async () => {
      const cost = await estimator.estimateCost("openai", "nonexistent", {
        input: 1000,
        output: 500,
      })
      expect(cost).toBe(0)
    })
  })

  describe("estimateCostWithBreakdown", () => {
    it("returns a full breakdown", async () => {
      const breakdown = await estimator.estimateCostWithBreakdown("openai", "gpt-4o", {
        input: 2_000_000,
        output: 500_000,
      })

      expect(breakdown.input.direct.tokens).toBe(2_000_000)
      expect(breakdown.input.direct.cost).toBeCloseTo(5)
      expect(breakdown.output.direct.tokens).toBe(500_000)
      expect(breakdown.output.direct.cost).toBeCloseTo(5)
    })
  })
})
