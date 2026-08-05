import { describe, expect, it } from "vitest"
import { WASTED_SPEND_MIN_SAMPLE_TRACES } from "../ports/cost-analytics-repository.ts"
import { wastedSpendShare } from "./wasted-spend.ts"

const AT_FLOOR = WASTED_SPEND_MIN_SAMPLE_TRACES

describe("wastedSpendShare", () => {
  it("divides errored spend by the window's spend once the sample clears the floor", () => {
    expect(wastedSpendShare({ erroredCostMicrocents: 120, totalMicrocents: 1_000, tracesWithUsage: AT_FLOOR })).toBe(
      0.12,
    )
  })

  it("withholds the share one trace below the floor, where a single failure moves it by tens of points", () => {
    expect(
      wastedSpendShare({ erroredCostMicrocents: 120, totalMicrocents: 1_000, tracesWithUsage: AT_FLOOR - 1 }),
    ).toBeNull()
  })

  it("withholds the share when the window spent nothing, rather than dividing by zero", () => {
    expect(wastedSpendShare({ erroredCostMicrocents: 0, totalMicrocents: 0, tracesWithUsage: 500 })).toBeNull()
  })

  it("withholds the share when errored traces recorded no spend — that is a $0 claim, not a 0% one", () => {
    expect(wastedSpendShare({ erroredCostMicrocents: 0, totalMicrocents: 1_000, tracesWithUsage: 500 })).toBeNull()
  })
})
