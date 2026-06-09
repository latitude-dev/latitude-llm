import type { DimensionValue, IssueDimensionDistribution } from "@domain/scores"
import { describe, expect, it } from "vitest"
import { computeDimensionOutliers } from "./dimension-outliers.ts"

const value = (v: string, count: number, percent: number): DimensionValue => ({ value: v, count, percent })

const distribution = (overrides: Partial<IssueDimensionDistribution>): IssueDimensionDistribution => ({
  dimension: "model",
  sampleSize: 100,
  issue: [],
  baseline: [],
  ...overrides,
})

describe("computeDimensionOutliers", () => {
  it("returns nothing when the issue sample is too small", () => {
    const result = computeDimensionOutliers(
      distribution({
        sampleSize: 5,
        issue: [value("claude-opus", 5, 1)],
        baseline: [value("claude-opus", 10, 0.1)],
      }),
    )
    expect(result).toEqual([])
  })

  it("flags values over-represented vs. baseline, sorted by lift", () => {
    const result = computeDimensionOutliers(
      distribution({
        sampleSize: 100,
        issue: [value("claude-opus", 60, 0.6), value("claude-sonnet", 40, 0.4)],
        baseline: [value("claude-opus", 300, 0.3), value("claude-sonnet", 700, 0.7)],
      }),
    )
    // opus: 0.6 / 0.3 = 2.0 (>= min lift); sonnet: 0.4 / 0.7 ≈ 0.57 (not over-represented).
    expect(result.map((o) => o.value)).toEqual(["claude-opus"])
    expect(result[0]?.lift).toBeCloseTo(2, 5)
    expect(result[0]?.baselinePercent).toBeCloseTo(0.3, 5)
  })

  it("drops values below the minimum occurrence count even when their lift is high", () => {
    const result = computeDimensionOutliers(
      distribution({
        sampleSize: 100,
        issue: [value("rare-model", 2, 0.02)],
        baseline: [value("rare-model", 1, 0.0001)],
      }),
    )
    expect(result).toEqual([])
  })

  it("yields a large finite lift for a value essentially absent from the baseline", () => {
    const result = computeDimensionOutliers(
      distribution({
        sampleSize: 100,
        issue: [value("brand-new-model", 50, 0.5)],
        baseline: [],
      }),
    )
    expect(result).toHaveLength(1)
    expect(Number.isFinite(result[0]?.lift)).toBe(true)
    expect(result[0]?.lift).toBeGreaterThan(1.5)
    expect(result[0]?.baselinePercent).toBe(0)
  })
})
