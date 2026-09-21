import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { deriveSamplingRates, PROVISIONAL_SAMPLING_TARGETS } from "./derive-sampling-rates.ts"

/**
 * A floor the sampler cannot clear withholds a dimension forever.
 *
 * Outcome and Safety are the two sampled dimensions, and `deriveSamplingRates` aims each judge at a
 * fixed number of examined sessions so a large project's evaluation spend stays bounded. That makes
 * the share of traffic it can examine fall as the project grows — 4% at five thousand eligible
 * sessions, the 1% rate floor at a hundred thousand. A floor expressed as a share of eligible
 * traffic is therefore unsatisfiable on exactly the projects with the most evidence, which is why
 * neither dimension has one and why this file exists to keep it that way.
 */
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

  /**
   * The headroom the targets carry over the floors is the attrition budget: sessions are lost to
   * rate limits, indeterminate verdicts and unreadable transcripts between selection and a usable
   * verdict, and a target aimed exactly at the floor would miss it every time one of those happens.
   */
  it("aims each target above its floor, leaving room for the sessions lost after selection", () => {
    expect(PROVISIONAL_SAMPLING_TARGETS.outcomeExaminedTarget).toBeGreaterThan(floors.outcome.examinedSessions)
    expect(PROVISIONAL_SAMPLING_TARGETS.safetyExaminedTarget).toBeGreaterThan(floors.safety.examinedSessions)
  })

  /**
   * The guard that keeps the two halves of the artifact consistent.
   *
   * Reliability, Cost and Speed read whatever telemetry a session already carries, so a share of
   * eligible traffic is a fair bar for them and they each keep one. Outcome and Safety pay a model
   * call per session, and their sampler answers a count — so a share floor added here would be a
   * floor no configuration could satisfy.
   */
  it("expresses no sampled floor as a share of eligible traffic", () => {
    expect(Object.keys(floors.outcome)).toEqual(["examinedSessions"])
    expect(Object.keys(floors.safety)).toEqual(["examinedSessions", "maxRateLimitedHintedShare"])
  })
})
