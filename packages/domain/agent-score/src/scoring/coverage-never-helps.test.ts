import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import { LAUNCH_LATENCY_REFERENCE_ARTIFACT } from "../artifacts/launch-latency-reference-artifact.ts"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import { lookupThroughputExpectationTps, lookupTtftExpectationNs } from "../entities/latency-reference-artifact.ts"
import { estimateProjectReliability } from "./estimate-reliability.ts"
import type { FamilyReadingCoverage, WindowFold } from "./fold-window-contributions.ts"
import { EMPTY_WINDOW_FOLD } from "./fold-window-contributions.ts"
import type { ReliabilitySessionEndpoint } from "./select-reliability-endpoints.ts"
import { gateCostWindow, gateSpeedWindow } from "./window-gates.ts"

/**
 * Rule 7, at window scale: observation coverage is not success.
 *
 * Each of these is a way evidence can be absent — an unbuilt artifact, a detector that never ran, a
 * family nothing could read — and the thing they must never do is make a score better. A missing
 * reading has to reach the page as "unmeasured" and not as "nothing wrong here", because the two
 * are indistinguishable to a reader and only one of them is true.
 */

const familyCoverage = (
  overrides: Partial<Record<CostFamily, FamilyReadingCoverage>> = {},
): Record<CostFamily, FamilyReadingCoverage> =>
  Object.fromEntries(
    COST_FAMILIES.map((family) => [family, overrides[family] ?? { applicable: 100, readable: 100 }]),
  ) as Record<CostFamily, FamilyReadingCoverage>

const fold = (overrides: Partial<WindowFold> = {}): WindowFold => ({
  ...EMPTY_WINDOW_FOLD,
  foldedSessionCount: 1_000,
  familyCoverage: familyCoverage(),
  ...overrides,
})

describe("an unreadable required family", () => {
  it("withholds Cost rather than scoring the sessions that happened to be readable", () => {
    const result = gateCostWindow({
      fold: fold({ familyCoverage: familyCoverage({ spend: { applicable: 500, readable: 20 } }) }),
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      floors: LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.cost,
    })

    expect(result.coverage).toBe("unmeasured")
  })

  it("withholds Cost rather than shrinking its denominator to the publishable sessions", () => {
    // Every withheld session was a session whose required family could not be read. Scoring what is
    // left would report the readable minority as if it described the project.
    const result = gateCostWindow({
      fold: fold({ foldedSessionCount: 100, withheldSessionCount: 900 }),
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      floors: LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.cost,
    })

    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "publishableSessionFloor" })
  })
})

describe("unreconstructable critical paths", () => {
  it("withhold Speed rather than dividing by the time that could be read", () => {
    const result = gateSpeedWindow({
      speed: {
        observedNs: 1_000,
        avoidableNs: 0,
        speed: 100,
        includedSessionCount: 20,
        excludedSessionCount: 9_980,
      },
      eligibleSessionCount: 10_000,
      floors: LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.speed,
    })

    // A perfect Speed over twenty readable sessions is not a project that was fast.
    expect(result.coverage).toBe("unmeasured")
  })
})

describe("sessions no reader could examine", () => {
  const endpoints = (readable: number, unreadable: number): ReliabilitySessionEndpoint[] => [
    ...Array.from({ length: readable }, (_, index) => ({
      sessionId: `ok-${index}`,
      terminalFailure: false,
      readable: true,
      causes: [],
    })),
    ...Array.from({ length: unreadable }, (_, index) => ({
      sessionId: `dark-${index}`,
      terminalFailure: false,
      readable: false,
      causes: [],
      unreadableReason: "unreadableTelemetry" as const,
    })),
  ]

  it("do not count as successes", () => {
    const result = estimateProjectReliability({
      eligibleSessionCount: 1_000,
      sessions: endpoints(300, 700),
      floors: { readableSessions: 1, readableShareOfEligible: 0 },
      referenceRunSessions: LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.reliability,
    })

    expect(result.readableSessionCount).toBe(300)
    expect(result.excluded.unreadableTelemetry).toBe(700)
  })

  it("take the dimension away entirely once too few sessions are left to describe the base", () => {
    const result = estimateProjectReliability({
      eligibleSessionCount: 1_000,
      sessions: endpoints(300, 700),
      floors: LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.reliability,
      referenceRunSessions: LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.reliability,
    })

    // Three hundred clean sessions out of a thousand is not a hundred-scoring project.
    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "coverageFloor" })
    expect(result.reliability).toBeUndefined()
  })
})

describe("a cohort the frozen reference does not cover", () => {
  it("reads as unmeasured rather than as a generation that was exactly on time", () => {
    const ttft = lookupTtftExpectationNs({
      artifact: LAUNCH_LATENCY_REFERENCE_ARTIFACT,
      provider: "some-provider",
      model: "a-model-nobody-published",
      inputTokens: 4_000,
      isStreaming: true,
    })
    const throughput = lookupThroughputExpectationTps({
      artifact: LAUNCH_LATENCY_REFERENCE_ARTIFACT,
      provider: "some-provider",
      model: "a-model-nobody-published",
      inputTokens: 4_000,
      outputTokens: 500,
      isStreaming: true,
    })

    expect(ttft.provenance).toBe("unmeasured")
    expect(throughput.provenance).toBe("unmeasured")
  })

  it("contributes no avoidable time, so an unknown model cannot make Speed look better or worse", () => {
    const unmeasured = lookupTtftExpectationNs({
      artifact: LAUNCH_LATENCY_REFERENCE_ARTIFACT,
      provider: "",
      model: "",
      inputTokens: 1_000,
      isStreaming: true,
    })

    expect(unmeasured).toEqual({ provenance: "unmeasured", reason: "unknownPair" })
  })
})
