import { describe, expect, it } from "vitest"
import { splitOptimizationExamples } from "./helpers.ts"

describe("optimization helpers", () => {
  it("splits examples deterministically into train and validation sets", () => {
    const examples = [
      { id: "trace-a", label: "positive" },
      { id: "trace-b", label: "positive" },
      { id: "trace-c", label: "negative" },
      { id: "trace-d", label: "negative" },
      { id: "trace-e", label: "negative" },
    ]

    const first = splitOptimizationExamples({
      examples,
      seed: 42,
      trainRatio: 0.7,
      validationRatio: 0.3,
    })
    const second = splitOptimizationExamples({
      examples,
      seed: 42,
      trainRatio: 0.7,
      validationRatio: 0.3,
    })

    expect(first).toEqual(second)
    expect(first.trainset.length).toBeGreaterThan(0)
    expect(first.valset.length).toBeGreaterThan(0)
    const usedIds = new Set([...first.trainset, ...first.valset].map((example) => example.id))

    expect(usedIds.size).toBe(first.trainset.length + first.valset.length)
    expect(usedIds.size).toBeLessThanOrEqual(examples.length)
  })

  it("keeps the train and validation splits balanced across labels", () => {
    const examples = [
      { id: "positive-1", label: "positive" },
      { id: "positive-2", label: "positive" },
      { id: "positive-3", label: "positive" },
      { id: "positive-4", label: "positive" },
      { id: "positive-5", label: "positive" },
      { id: "negative-1", label: "negative" },
      { id: "negative-2", label: "negative" },
      { id: "negative-3", label: "negative" },
      { id: "negative-4", label: "negative" },
      { id: "negative-5", label: "negative" },
    ]

    const result = splitOptimizationExamples({
      examples,
      seed: 42,
      trainRatio: 0.7,
      validationRatio: 0.3,
    })

    const trainPositives = result.trainset.filter((example) => example.id.startsWith("positive-")).length
    const trainNegatives = result.trainset.filter((example) => example.id.startsWith("negative-")).length
    const validationPositives = result.valset.filter((example) => example.id.startsWith("positive-")).length
    const validationNegatives = result.valset.filter((example) => example.id.startsWith("negative-")).length

    expect(result.trainset).toHaveLength(7)
    expect(result.valset).toHaveLength(3)
    expect(Math.abs(trainPositives - trainNegatives)).toBeLessThanOrEqual(1)
    expect(Math.abs(validationPositives - validationNegatives)).toBeLessThanOrEqual(1)
  })
})
