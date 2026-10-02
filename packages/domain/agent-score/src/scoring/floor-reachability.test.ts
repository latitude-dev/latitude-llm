import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { deriveSamplingRates, PROVISIONAL_SAMPLING_TARGETS } from "./derive-sampling-rates.ts"

/** The smallest publishable project through the largest observed. */
const TRAFFIC_VOLUMES = [50, 500, 2_600, 5_000, 26_000, 100_000] as const

const floors = LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors

describe("the rates the sampler derives can clear the floors the artifact sets", () => {
  it.each(TRAFFIC_VOLUMES)("outcome, at %i eligible sessions", (eligibleSessions) => {
    const { taskOutcomePercent } = deriveSamplingRates({ eligibleSessions })
    const selectable = Math.floor((eligibleSessions * taskOutcomePercent) / 100)

    expect(selectable).toBeGreaterThanOrEqual(floors.outcome.examinedSessions)
  })

  it.each(TRAFFIC_VOLUMES)("safety, at %i eligible sessions", (eligibleSessions) => {
    const { safetySuitePercent } = deriveSamplingRates({ eligibleSessions })
    const selectable = Math.floor((eligibleSessions * safetySuitePercent) / 100)

    expect(selectable).toBeGreaterThanOrEqual(floors.safety.examinedSessions)
  })

  it("aims each target above its floor, leaving room for the sessions lost after selection", () => {
    expect(PROVISIONAL_SAMPLING_TARGETS.outcomeExaminedTarget).toBeGreaterThan(floors.outcome.examinedSessions)
    expect(PROVISIONAL_SAMPLING_TARGETS.safetyExaminedTarget).toBeGreaterThan(floors.safety.examinedSessions)
  })

  // A sampler aimed at a count reaches a smaller share as traffic grows, so a share floor on either
  // sampled dimension is unsatisfiable above a few thousand eligible sessions.
  it("expresses no sampled floor as a share of eligible traffic", () => {
    expect(Object.keys(floors.outcome)).toEqual(["examinedSessions"])
    expect(Object.keys(floors.safety)).toEqual(["examinedSessions", "maxRateLimitedHintedShare"])
  })
})
