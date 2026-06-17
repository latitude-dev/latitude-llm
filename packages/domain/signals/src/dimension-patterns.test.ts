import type { DimensionConditionalRate, IssueDimensionComparison } from "@domain/scores"
import { describe, expect, it } from "vitest"
import { ISSUE_DIMENSION_MIN_SUPPORT } from "./constants.ts"
import { rankDimensionValues } from "./dimension-patterns.ts"

const value = (
  v: string,
  affectedTraces: number,
  totalTraces: number,
  issueAffectedTraces: number,
): DimensionConditionalRate => ({
  value: v,
  affectedTraces,
  totalTraces,
  conditionalRate: totalTraces === 0 ? 0 : affectedTraces / totalTraces,
  coverage: issueAffectedTraces === 0 ? 0 : affectedTraces / issueAffectedTraces,
})

const comparison = (overrides: Partial<IssueDimensionComparison>): IssueDimensionComparison => ({
  dimension: "model",
  baseRate: 0.1,
  issueAffectedTraces: 100,
  values: [],
  ...overrides,
})

describe("rankDimensionValues", () => {
  it("drops values below the minimum trace support even when their rate is 100%", () => {
    const result = rankDimensionValues(
      comparison({
        baseRate: 0.1,
        issueAffectedTraces: 100,
        // 100% conditional rate, but only ISSUE_DIMENSION_MIN_SUPPORT - 1 traces back it.
        values: [value("rare-model", ISSUE_DIMENSION_MIN_SUPPORT - 1, ISSUE_DIMENSION_MIN_SUPPORT - 1, 100)],
      }),
    )
    expect(result).toEqual([])
  })

  it("keeps values whose conditional rate is elevated above the base rate", () => {
    const result = rankDimensionValues(
      comparison({
        baseRate: 0.1,
        issueAffectedTraces: 100,
        values: [
          // 85% of gpt-5.5 traces are in the issue vs a 10% base rate → elevation +0.75.
          value("gpt-5.5", 85, 100, 100),
          // 12% — barely above base, still elevated (+0.02).
          value("claude-opus", 12, 100, 100),
        ],
      }),
    )
    expect(result.map((p) => p.value)).toEqual(["gpt-5.5", "claude-opus"])
    expect(result[0]?.rateElevation).toBeCloseTo(0.75, 5)
    expect(result[0]?.conditionalRate).toBeCloseTo(0.85, 5)
  })

  it("drops values at or below the base rate (not over-represented)", () => {
    const result = rankDimensionValues(
      comparison({
        baseRate: 0.1,
        issueAffectedTraces: 100,
        values: [
          value("at-base", 10, 100, 100), // exactly the base rate → elevation 0
          value("below-base", 4, 100, 100), // below the base rate → negative elevation
        ],
      }),
    )
    expect(result).toEqual([])
  })

  it("drops values elevated by less than the minimum (sub-1pp)", () => {
    const result = rankDimensionValues(
      comparison({
        baseRate: 0.1,
        issueAffectedTraces: 100,
        values: [
          value("barely", 1005, 10_000, 100), // 10.05% → +0.0005 elevation, below the 1pp floor
          value("clears", 1200, 10_000, 100), // 12% → +0.02 elevation, clears the floor
        ],
      }),
    )
    expect(result.map((p) => p.value)).toEqual(["clears"])
  })

  it("sorts by rate-elevation descending, most over-represented first", () => {
    const result = rankDimensionValues(
      comparison({
        baseRate: 0.05,
        issueAffectedTraces: 200,
        values: [
          value("mid", 60, 200, 200), // 30% → +0.25
          value("top", 90, 100, 200), // 90% → +0.85
          value("low", 30, 200, 200), // 15% → +0.10
        ],
      }),
    )
    expect(result.map((p) => p.value)).toEqual(["top", "mid", "low"])
  })

  it("carries coverage through so niche-but-strong values stay distinguishable", () => {
    const [pattern] = rankDimensionValues(
      comparison({
        baseRate: 0.03,
        issueAffectedTraces: 1000,
        // 93% conditional rate but only 28 of 1000 issue traces → 2.8% coverage.
        values: [value("niche", 28, 30, 1000)],
      }),
    )
    expect(pattern?.conditionalRate).toBeCloseTo(28 / 30, 5)
    expect(pattern?.coverage).toBeCloseTo(0.028, 5)
  })
})
