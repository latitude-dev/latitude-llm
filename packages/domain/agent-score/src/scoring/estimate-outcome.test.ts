import { describe, expect, it } from "vitest"
import {
  type EstimateProjectOutcomeInput,
  estimateProjectOutcome,
  type OutcomeSessionVerdict,
} from "./estimate-outcome.ts"

const VERSION = "task-failure-v1:amazon-bedrock/anthropic.claude-haiku-4-5"

const verdicts = (input: {
  readonly successes: number
  readonly failures: number
  readonly inclusionProbability: number
  readonly judgmentVersion?: string
  readonly prefix?: string
}): OutcomeSessionVerdict[] =>
  Array.from({ length: input.successes + input.failures }, (_, index) => ({
    sessionId: `${input.prefix ?? "session"}-${index}`,
    succeeded: index < input.successes,
    inclusionProbability: input.inclusionProbability,
    judgmentVersion: input.judgmentVersion ?? VERSION,
  }))

const estimate = (overrides: Partial<EstimateProjectOutcomeInput> = {}) =>
  estimateProjectOutcome({
    eligibleSessionCount: 2_000,
    deterministicFailureSessionIds: [],
    judgedSessions: verdicts({ successes: 160, failures: 40, inclusionProbability: 0.1 }),
    supportedJudgmentVersions: [VERSION],
    ...overrides,
  })

describe("estimateProjectOutcome", () => {
  it("reports the sampled success rate when the judge is the only evidence", () => {
    const result = estimate()

    expect(result.coverage).toBe("measured")
    expect(result.outcome).toBeCloseTo(80, 10)
    expect(result.intervalMethod).toBe("exactBinomial")
    expect(result.interval?.lower).toBeLessThan(80)
    expect(result.interval?.upper).toBeGreaterThan(80)
    expect(result).toMatchObject({ sampledSessionCount: 200, deterministicSessionCount: 0, examinedSessionCount: 200 })
  })

  // The census is 1 session per session; the sample is 10 per session at 10%.
  // 160 successes weigh 1600 against 400 sampled failures and 100 certain ones.
  it("pulls the rate down by the deterministic census, weighting it as a census", () => {
    const result = estimate({
      deterministicFailureSessionIds: Array.from({ length: 100 }, (_, index) => `deterministic-${index}`),
    })

    expect(result.outcome).toBeCloseTo((100 * 1600) / (100 + 2000), 10)
    expect(result).toMatchObject({ deterministicSessionCount: 100, sampledSessionCount: 200 })
  })

  // Counting a session twice would break the sample's claim to be a random draw
  // of the sessions it represents.
  it("removes a judged session that also has a deterministic endpoint", () => {
    const judged = verdicts({ successes: 160, failures: 40, inclusionProbability: 0.1 })
    const result = estimate({ judgedSessions: judged, deterministicFailureSessionIds: [judged[0]!.sessionId] })

    expect(result.sampledSessionCount).toBe(199)
    expect(result.deterministicSessionCount).toBe(1)
    expect(result.excluded.deterministicEndpoint).toBe(1)
  })

  it("excludes a verdict from an unsupported judge and says so", () => {
    const result = estimate({
      judgedSessions: [
        ...verdicts({ successes: 160, failures: 40, inclusionProbability: 0.1 }),
        ...verdicts({ successes: 5, failures: 0, inclusionProbability: 0.1, judgmentVersion: "other", prefix: "old" }),
      ],
    })

    expect(result.excluded.incompatibleJudgmentVersion).toBe(5)
    expect(result.sampledSessionCount).toBe(200)
    expect(result.outcome).toBeCloseTo(80, 10)
  })

  it("excludes a verdict whose selection probability is unusable", () => {
    const result = estimate({
      judgedSessions: [
        ...verdicts({ successes: 160, failures: 40, inclusionProbability: 0.1 }),
        ...verdicts({ successes: 3, failures: 0, inclusionProbability: 0, prefix: "unknown" }),
      ],
    })

    expect(result.excluded.unknownInclusionProbability).toBe(3)
    expect(result.sampledSessionCount).toBe(200)
  })

  it("weights sub-strata separately when the project changed its sampling rate", () => {
    const result = estimate({
      judgedSessions: [
        ...verdicts({ successes: 80, failures: 20, inclusionProbability: 0.1, prefix: "early" }),
        ...verdicts({ successes: 50, failures: 50, inclusionProbability: 0.5, prefix: "late" }),
      ],
    })

    // 800 weighted successes from the 10% stratum, 100 from the 50% stratum,
    // over 1000 + 200 total weight.
    expect(result.outcome).toBeCloseTo((100 * 900) / 1200, 10)
    expect(result.intervalMethod).toBe("stratifiedBinomial")
  })

  it("reports a wider interval for split strata than for one pooled stratum", () => {
    const split = estimate({
      judgedSessions: [
        ...verdicts({ successes: 80, failures: 20, inclusionProbability: 0.1, prefix: "early" }),
        ...verdicts({ successes: 80, failures: 20, inclusionProbability: 0.1000001, prefix: "late" }),
      ],
    })
    const pooled = estimate({ judgedSessions: verdicts({ successes: 160, failures: 40, inclusionProbability: 0.1 }) })

    expect(split.intervalMethod).toBe("stratifiedBinomial")
    expect(split.interval!.upper - split.interval!.lower).toBeGreaterThan(
      pooled.interval!.upper - pooled.interval!.lower,
    )
  })

  it("keeps a non-degenerate interval when every judged session succeeded", () => {
    const result = estimate({ judgedSessions: verdicts({ successes: 200, failures: 0, inclusionProbability: 0.1 }) })

    expect(result.outcome).toBeCloseTo(100, 10)
    expect(result.interval!.lower).toBeGreaterThan(0)
    expect(result.interval!.lower).toBeLessThan(100)
    expect(result.interval!.upper).toBeCloseTo(100, 10)
  })

  it("keeps a non-degenerate interval when every judged session failed", () => {
    const result = estimate({ judgedSessions: verdicts({ successes: 0, failures: 200, inclusionProbability: 0.1 }) })

    expect(result.outcome).toBe(0)
    expect(result.interval!.lower).toBe(0)
    expect(result.interval!.upper).toBeGreaterThan(0)
  })

  describe("when it cannot measure", () => {
    it("names the examined floor and publishes no number", () => {
      const result = estimate({ judgedSessions: verdicts({ successes: 8, failures: 2, inclusionProbability: 0.1 }) })

      expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "examinedFloor" })
      expect(result.outcome).toBeUndefined()
      expect(result.interval).toBeUndefined()
      expect(result.intervalMethod).toBeUndefined()
    })

    it("names the coverage floor when the judged share is too thin", () => {
      const result = estimate({ eligibleSessionCount: 100_000 })

      expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "coverageFloor" })
      expect(result.outcome).toBeUndefined()
    })

    // Deterministic failures alone would otherwise publish a score of zero for a
    // project the judge never looked at.
    it("does not publish zero when only the deterministic census exists", () => {
      const result = estimate({
        judgedSessions: [],
        deterministicFailureSessionIds: Array.from({ length: 500 }, (_, index) => `deterministic-${index}`),
      })

      expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "examinedFloor" })
      expect(result.outcome).toBeUndefined()
    })

    it("does not divide by an empty eligible base", () => {
      const result = estimate({ eligibleSessionCount: 0 })

      expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "coverageFloor" })
      expect(result.outcome).toBeUndefined()
    })
  })
})
