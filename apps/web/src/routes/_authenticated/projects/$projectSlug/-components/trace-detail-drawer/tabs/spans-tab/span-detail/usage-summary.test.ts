import { describe, expect, it } from "vitest"
import {
  buildCostSegments,
  buildTokenSegments,
  computeTotalTokens,
  hasAnyUsage,
  type UsageData,
} from "./usage-summary.tsx"

function makeUsage(overrides: Partial<UsageData> = {}): UsageData {
  return {
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    ...overrides,
  }
}

describe("computeTotalTokens", () => {
  it("sums all five additive parts", () => {
    const data = makeUsage({
      tokensInput: 100,
      tokensOutput: 50,
      tokensCacheRead: 30,
      tokensCacheCreate: 20,
      tokensReasoning: 10,
    })
    expect(computeTotalTokens(data)).toBe(210)
  })

  it("includes cache and reasoning (not just input + output)", () => {
    const data = makeUsage({
      tokensInput: 0,
      tokensOutput: 0,
      tokensCacheRead: 1000,
      tokensCacheCreate: 500,
      tokensReasoning: 200,
    })
    expect(computeTotalTokens(data)).toBe(1700)
  })

  it("is zero for empty usage", () => {
    expect(computeTotalTokens(makeUsage())).toBe(0)
  })
})

describe("hasAnyUsage", () => {
  it("returns false when all token counts are zero", () => {
    expect(hasAnyUsage(makeUsage())).toBe(false)
  })

  it("returns true when only cache read is non-zero", () => {
    expect(hasAnyUsage(makeUsage({ tokensCacheRead: 1 }))).toBe(true)
  })

  it("returns true when only cache create is non-zero", () => {
    expect(hasAnyUsage(makeUsage({ tokensCacheCreate: 1 }))).toBe(true)
  })

  it("returns true when only reasoning is non-zero", () => {
    expect(hasAnyUsage(makeUsage({ tokensReasoning: 1 }))).toBe(true)
  })
})

describe("buildTokenSegments", () => {
  it("uses additive values directly without re-subtracting sub-categories", () => {
    // tokensInput is already non-cached (additive). Cache read/write are
    // separate subsets of total input. Re-subtracting would under-count.
    const data = makeUsage({
      tokensInput: 100,
      tokensCacheRead: 30,
      tokensCacheCreate: 20,
      tokensOutput: 50,
      tokensReasoning: 10,
    })

    const segments = buildTokenSegments(data)
    const byLabel = Object.fromEntries(segments.map((s) => [s.label, s.value]))

    expect(byLabel.Prompt).toBe(100)
    expect(byLabel["Cache Read"]).toBe(30)
    expect(byLabel["Cache Write"]).toBe(20)
    expect(byLabel.Completion).toBe(50)
    expect(byLabel.Reasoning).toBe(10)
  })

  it("does not treat cache write as an output subcategory", () => {
    // Regression: prior bug subtracted tokensCacheCreate from completion.
    const data = makeUsage({ tokensOutput: 80, tokensCacheCreate: 500 })
    const segments = buildTokenSegments(data)
    const completion = segments.find((s) => s.label === "Completion")
    expect(completion?.value).toBe(80)
  })

  it("emits segments in fixed order: Cache Read, Cache Write, Prompt, Reasoning, Completion", () => {
    const data = makeUsage({
      tokensInput: 1,
      tokensOutput: 1,
      tokensCacheRead: 1,
      tokensCacheCreate: 1,
      tokensReasoning: 1,
    })
    const labels = buildTokenSegments(data).map((s) => s.label)
    expect(labels).toEqual(["Cache Read", "Cache Write", "Prompt", "Reasoning", "Completion"])
  })

  it("omits zero-value segments", () => {
    const data = makeUsage({ tokensInput: 10, tokensOutput: 5 })
    const labels = buildTokenSegments(data).map((s) => s.label)
    expect(labels).toEqual(["Prompt", "Completion"])
  })

  it("returns no segments when usage is empty", () => {
    expect(buildTokenSegments(makeUsage())).toEqual([])
  })

  it("segment sum equals computeTotalTokens", () => {
    const data = makeUsage({
      tokensInput: 100,
      tokensOutput: 50,
      tokensCacheRead: 30,
      tokensCacheCreate: 20,
      tokensReasoning: 10,
    })
    const segmentSum = buildTokenSegments(data).reduce((acc, s) => acc + s.value, 0)
    expect(segmentSum).toBe(computeTotalTokens(data))
  })
})

describe("buildCostSegments", () => {
  it("emits input and output segments when both are non-zero", () => {
    const data = makeUsage({ costInputMicrocents: 100, costOutputMicrocents: 200 })
    const segments = buildCostSegments(data)
    expect(segments.map((s) => s.label)).toEqual(["Input", "Output"])
    expect(segments.map((s) => s.value)).toEqual([100, 200])
  })

  it("omits zero-cost segments", () => {
    const data = makeUsage({ costInputMicrocents: 0, costOutputMicrocents: 200 })
    expect(buildCostSegments(data).map((s) => s.label)).toEqual(["Output"])
  })

  it("returns no segments when both costs are zero", () => {
    expect(buildCostSegments(makeUsage())).toEqual([])
  })
})
