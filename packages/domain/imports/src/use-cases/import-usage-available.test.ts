import { describe, expect, it } from "vitest"
import { remainingAfterInFlightImport } from "./import-usage-available.ts"

describe("remainingAfterInFlightImport", () => {
  it("leaves an uncapped plan alone", () => {
    expect(
      remainingAfterInFlightImport({
        remaining: null,
        consumedCredits: 10,
        tracesImported: 5,
        consumedCreditsAtStart: 10,
      }),
    ).toBeNull()
  })

  it("subtracts traces this job has billed that the period has not yet recorded", () => {
    expect(
      remainingAfterInFlightImport({
        remaining: 10,
        consumedCredits: 90,
        tracesImported: 10,
        consumedCreditsAtStart: 90,
      }),
    ).toBe(0)
  })

  it("does not subtract traces the period already recorded", () => {
    expect(
      remainingAfterInFlightImport({
        remaining: 10,
        consumedCredits: 100,
        tracesImported: 10,
        consumedCreditsAtStart: 90,
      }),
    ).toBe(10)
  })
})
