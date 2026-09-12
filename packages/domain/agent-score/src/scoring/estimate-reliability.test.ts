import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import type { ReliabilityCoverageFloors } from "../entities/agent-score-artifact.ts"
import { type EstimateProjectReliabilityInput, estimateProjectReliability } from "./estimate-reliability.ts"
import type { ReliabilitySessionEndpoint } from "./select-reliability-endpoints.ts"

const REFERENCE_RUN = LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.reliability

const OPEN_FLOORS: ReliabilityCoverageFloors = { readableSessions: 1, readableShareOfEligible: 0 }

const endpoints = ({
  successes,
  failures,
  unreadable = 0,
}: {
  readonly successes: number
  readonly failures: number
  readonly unreadable?: number
}): ReliabilitySessionEndpoint[] => [
  ...Array.from({ length: successes }, (_, index) => ({
    sessionId: `ok-${index}`,
    terminalFailure: false,
    readable: true,
  })),
  ...Array.from({ length: failures }, (_, index) => ({
    sessionId: `bad-${index}`,
    terminalFailure: true,
    readable: true,
  })),
  ...Array.from({ length: unreadable }, (_, index) => ({
    sessionId: `dark-${index}`,
    terminalFailure: false,
    readable: false,
    unreadableReason: "unreadableTelemetry" as const,
  })),
]

const estimate = (overrides: Partial<EstimateProjectReliabilityInput> = {}) =>
  estimateProjectReliability({
    eligibleSessionCount: 1_000,
    sessions: endpoints({ successes: 950, failures: 50 }),
    floors: OPEN_FLOORS,
    referenceRunSessions: REFERENCE_RUN,
    ...overrides,
  })

describe("estimateProjectReliability", () => {
  it("compounds the one-session success rate over the reference run", () => {
    const result = estimate()

    expect(result.successRate).toBeCloseTo(0.95, 12)
    expect(result.reliability).toBeCloseTo(100 * 0.95 ** REFERENCE_RUN, 9)
    expect(result.coverage).toBe("measured")
  })

  it("always reports the one-session rate beside the score", () => {
    const result = estimate({ sessions: endpoints({ successes: 900, failures: 100 }) })

    expect(result.successRate).toBeCloseTo(0.9, 12)
    expect(result.reliability).toBeDefined()
  })

  it("reads far below its one-session rate, which is the point of the horizon", () => {
    const result = estimate()

    // 95% of sessions completing is a 36% chance of twenty in a row.
    expect(result.reliability).toBeLessThan(40)
    expect(result.successRate).toBeGreaterThan(0.9)
  })

  it("keeps the interval ordered and around the point estimate", () => {
    const result = estimate()

    expect(result.interval?.lower).toBeLessThanOrEqual(result.reliability as number)
    expect(result.interval?.upper).toBeGreaterThanOrEqual(result.reliability as number)
  })

  it("stays non-degenerate with no observed failures", () => {
    const result = estimate({ sessions: endpoints({ successes: 500, failures: 0 }), eligibleSessionCount: 500 })

    expect(result.reliability).toBe(100)
    expect(result.interval?.lower).toBeGreaterThan(0)
    expect(result.interval?.lower).toBeLessThan(100)
  })

  it("stays non-degenerate when every session failed", () => {
    const result = estimate({ sessions: endpoints({ successes: 0, failures: 300 }), eligibleSessionCount: 300 })

    expect(result.reliability).toBe(0)
    expect(result.successRate).toBe(0)
    expect(result.interval?.upper).toBeGreaterThan(0)
  })

  it("falls as observed failures rise", () => {
    const scores = [0, 10, 50, 200].map(
      (failures) => estimate({ sessions: endpoints({ successes: 1_000 - failures, failures }) }).reliability as number,
    )

    expect(scores).toEqual([...scores].sort((left, right) => right - left))
  })

  it("uses the exact binomial, because a census was not sampled for", () => {
    expect(estimate().intervalMethod).toBe("exactBinomial")
  })

  it("counts unreadable sessions out of both sides of the rate and reports why", () => {
    const result = estimate({
      sessions: endpoints({ successes: 90, failures: 10, unreadable: 400 }),
      eligibleSessionCount: 500,
    })

    expect(result.readableSessionCount).toBe(100)
    expect(result.terminalFailureSessionCount).toBe(10)
    expect(result.excluded.unreadableTelemetry).toBe(400)
    expect(result.successRate).toBeCloseTo(0.9, 12)
  })

  it("separates a session no reader could examine from one examined incompletely", () => {
    const result = estimate({
      sessions: [
        ...endpoints({ successes: 10, failures: 0 }),
        { sessionId: "none", terminalFailure: false, readable: false, unreadableReason: "noApplicableReader" },
      ],
      eligibleSessionCount: 11,
    })

    expect(result.excluded).toEqual({ unreadableTelemetry: 0, noApplicableReader: 1 })
  })
})

describe("reliability publication floors", () => {
  it("publishes no number below the readable-session floor and names the floor", () => {
    const result = estimate({
      sessions: endpoints({ successes: 50, failures: 5 }),
      floors: { readableSessions: 200, readableShareOfEligible: 0 },
    })

    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "readableFloor" })
    expect(result.reliability).toBeUndefined()
    expect(result.successRate).toBeUndefined()
    expect(result.interval).toBeUndefined()
  })

  it("publishes no number when the readable sessions describe too little of the base", () => {
    const result = estimate({
      sessions: endpoints({ successes: 100, failures: 0 }),
      eligibleSessionCount: 10_000,
      floors: { readableSessions: 10, readableShareOfEligible: 0.8 },
    })

    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "coverageFloor" })
    expect(result.reliability).toBeUndefined()
  })

  it("still reports counts when it publishes no score, so the page can show progress to the floor", () => {
    const result = estimate({
      sessions: endpoints({ successes: 50, failures: 5 }),
      floors: LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.reliability,
    })

    expect(result.readableSessionCount).toBe(55)
    expect(result.terminalFailureSessionCount).toBe(5)
    expect(result.eligibleSessionCount).toBe(1_000)
  })

  it("publishes nothing from an empty window, whatever the configured floor", () => {
    const result = estimate({
      sessions: [],
      eligibleSessionCount: 0,
      floors: { readableSessions: 0, readableShareOfEligible: 0 },
    })

    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "readableFloor" })
    expect(result.reliability).toBeUndefined()
  })

  it("never returns a midpoint, a zero, or a hundred for an unmeasured dimension", () => {
    const result = estimate({
      sessions: [],
      floors: LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.reliability,
    })

    expect(result.coverage).toBe("unmeasured")
    expect(result.reliability).toBeUndefined()
  })
})

describe("reliability invariance", () => {
  it("does not move when the same traffic is duplicated", () => {
    const once = estimate({ sessions: endpoints({ successes: 190, failures: 10 }), eligibleSessionCount: 200 })
    const twice = estimate({
      sessions: [
        ...endpoints({ successes: 190, failures: 10 }),
        ...endpoints({ successes: 190, failures: 10 }).map((endpoint) => ({
          ...endpoint,
          sessionId: `${endpoint.sessionId}-copy`,
        })),
      ],
      eligibleSessionCount: 400,
    })

    expect(twice.reliability).toBeCloseTo(once.reliability as number, 9)
    expect(twice.successRate).toBeCloseTo(once.successRate as number, 12)
  })
})
