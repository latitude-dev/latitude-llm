import { describe, expect, it } from "vitest"
import { boundedPercentiles } from "./telemetry-percentiles.ts"

describe("boundedPercentiles", () => {
  it("summarizes to p10/p50/p90 and never returns the raw array", () => {
    const percentiles = boundedPercentiles([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(percentiles.p10).toBeCloseTo(1)
    expect(percentiles.p50).toBeCloseTo(5)
    expect(percentiles.p90).toBeCloseTo(9)
  })

  it("is zero-safe on an empty distribution", () => {
    expect(boundedPercentiles([])).toEqual({ p10: 0, p50: 0, p90: 0 })
  })
})
