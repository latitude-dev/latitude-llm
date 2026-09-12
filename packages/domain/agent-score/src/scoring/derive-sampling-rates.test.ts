import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { deriveSamplingRates, PROVISIONAL_SAMPLING_TARGETS } from "./derive-sampling-rates.ts"

describe("deriveSamplingRates", () => {
  it("examines nearly everything on a project that barely reaches the session target", () => {
    const rates = deriveSamplingRates({ eligibleSessions: 1_000 })

    // At a fixed tenth this project would examine a hundred sessions against a floor of a thousand.
    expect(rates.safetySuitePercent).toBe(100)
    expect(rates.taskOutcomePercent).toBe(20)
  })

  it("samples a large project down, so cost does not grow with traffic", () => {
    const rates = deriveSamplingRates({ eligibleSessions: 100_000 })

    expect(rates.safetySuitePercent).toBeLessThan(5)
    expect(rates.taskOutcomePercent).toBeLessThan(5)
  })

  it("keeps the examined count roughly at the target as traffic grows", () => {
    for (const eligibleSessions of [2_000, 10_000, 50_000]) {
      const rates = deriveSamplingRates({ eligibleSessions })
      const examined = (eligibleSessions * rates.safetySuitePercent) / 100

      expect(examined).toBeGreaterThanOrEqual(PROVISIONAL_SAMPLING_TARGETS.safetyExaminedTarget)
    }
  })

  it("rounds up, because a rate just under the target examines just under the floor", () => {
    const rates = deriveSamplingRates({ eligibleSessions: 3_000 })

    expect(rates.safetySuitePercent).toBe(40)
    expect((3_000 * 40) / 100).toBeGreaterThanOrEqual(PROVISIONAL_SAMPLING_TARGETS.safetyExaminedTarget)
  })

  it("never drops below the minimum, so a very large project still examines something", () => {
    const rates = deriveSamplingRates({ eligibleSessions: 10_000_000 })

    expect(rates.safetySuitePercent).toBe(PROVISIONAL_SAMPLING_TARGETS.minimumSamplingPercent)
  })

  it("never exceeds a census", () => {
    const rates = deriveSamplingRates({ eligibleSessions: 10 })

    expect(rates.safetySuitePercent).toBe(100)
    expect(rates.taskOutcomePercent).toBe(100)
  })

  it("aims above each floor, because sessions are lost between selection and a usable verdict", () => {
    expect(PROVISIONAL_SAMPLING_TARGETS.safetyExaminedTarget).toBeGreaterThan(
      LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.safety.examinedSessions,
    )
    expect(PROVISIONAL_SAMPLING_TARGETS.outcomeExaminedTarget).toBeGreaterThan(
      LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.outcome.examinedSessions,
    )
  })
})
