import { describe, expect, it } from "vitest"
import {
  type EstimateProjectSafetyInput,
  estimateProjectSafety,
  type SafetyCoverageFloors,
  type SafetyMemberDecision,
  type SafetySessionExamination,
} from "./estimate-safety.ts"

const SUITE = ["jailbreaking", "pii-leakage"]
const JUDGE = "safety-v1:amazon-bedrock/anthropic.claude-haiku-4-5"
const GENERATION = "a".repeat(64)

const OPEN_FLOORS: SafetyCoverageFloors = {
  examinedSessions: 1,
  examinedShareOfEligible: 0,
  maxRateLimitedHintedShare: 1,
}

/** `exactOptionalPropertyTypes` forbids an explicit undefined, and a member that never reported is the case under test. */
const pending = (flaggerSlug: string, overrides: Partial<SafetyMemberDecision> = {}): SafetyMemberDecision => {
  const { outcome: _outcome, ...rest } = member(flaggerSlug, overrides)
  return rest
}

const member = (flaggerSlug: string, overrides: Partial<SafetyMemberDecision> = {}): SafetyMemberDecision => ({
  flaggerSlug,
  analysisHash: GENERATION,
  selected: true,
  reason: "ordinary-sample",
  inclusionProbability: 0.1,
  outcome: "unmatched",
  hintKinds: [],
  ...overrides,
})

const examined = (
  sessionId: string,
  options: {
    readonly harmed?: boolean
    readonly probability?: number
    readonly hinted?: boolean
    readonly harmVersion?: string
  } = {},
): SafetySessionExamination => {
  const shared = {
    inclusionProbability: options.probability ?? 0.1,
    ...(options.hinted ? { reason: "hinted" as const, inclusionProbability: 1, hintKinds: ["pattern:injection"] } : {}),
  }
  return {
    sessionId,
    decisions: SUITE.map((slug) => member(slug, shared)),
    harmJudgmentVersions: options.harmed ? [options.harmVersion ?? JUDGE] : [],
  }
}

const estimate = (sessions: readonly SafetySessionExamination[], overrides: Partial<EstimateProjectSafetyInput> = {}) =>
  estimateProjectSafety({
    eligibleSessionCount: sessions.length,
    sessions,
    suiteSlugs: SUITE,
    supportedJudgmentVersions: [JUDGE],
    floors: OPEN_FLOORS,
    ...overrides,
  })

const cleanSessions = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => examined(`session-${from + index}`))

describe("estimateProjectSafety examined population", () => {
  it("counts a session only when every applicable member completed in one generation", () => {
    const result = estimate([examined("session-1")])

    expect(result).toMatchObject({ examinedSessionCount: 1, coverage: "measured" })
  })

  it.each([
    { label: "a member that never reached a judgement", partner: pending("pii-leakage") },
    { label: "a member whose execution failed", partner: member("pii-leakage", { outcome: "error" }) },
    { label: "a member the judge could not decide", partner: member("pii-leakage", { outcome: "indeterminate" }) },
  ])("leaves a session unexamined for $label", ({ partner }) => {
    const result = estimate([
      { sessionId: "session-1", decisions: [member("jailbreaking"), partner], harmJudgmentVersions: [] },
    ])

    expect(result).toMatchObject({ examinedSessionCount: 0, excluded: expect.objectContaining({ incompleteSuite: 1 }) })
  })

  it("leaves a session unexamined when a member was never selected", () => {
    const result = estimate([
      {
        sessionId: "session-1",
        decisions: [member("jailbreaking"), pending("pii-leakage", { selected: false })],
        harmJudgmentVersions: [],
      },
    ])

    expect(result.excluded.incompleteSuite).toBe(1)
  })

  it("leaves a session unexamined when a member is missing entirely", () => {
    const result = estimate([{ sessionId: "session-1", decisions: [member("jailbreaking")], harmJudgmentVersions: [] }])

    expect(result.excluded.incompleteSuite).toBe(1)
  })

  // Halves of two runs are not one examination of one session.
  it("rejects a suite whose members answered in different generations", () => {
    const result = estimate([
      {
        sessionId: "session-1",
        decisions: [member("jailbreaking"), member("pii-leakage", { analysisHash: "b".repeat(64) })],
        harmJudgmentVersions: [],
      },
    ])

    expect(result.excluded.incompleteSuite).toBe(1)
  })

  it("completes the suite on the member that could read the session", () => {
    const result = estimate([
      {
        sessionId: "session-1",
        decisions: [member("jailbreaking"), member("pii-leakage", { outcome: "notApplicable" })],
        harmJudgmentVersions: [],
      },
    ])

    expect(result).toMatchObject({ examinedSessionCount: 1, coverage: "measured" })
  })

  it("does not examine a session no member could read", () => {
    const result = estimate([
      {
        sessionId: "session-1",
        decisions: SUITE.map((slug) => member(slug, { outcome: "notApplicable" })),
        harmJudgmentVersions: [],
      },
    ])

    expect(result).toMatchObject({
      examinedSessionCount: 0,
      excluded: expect.objectContaining({ suiteNotApplicable: 1 }),
    })
  })

  it("excludes a session whose members disagree about the probability that selected them", () => {
    const result = estimate([
      {
        sessionId: "session-1",
        decisions: [member("jailbreaking"), member("pii-leakage", { inclusionProbability: 0.5 })],
        harmJudgmentVersions: [],
      },
    ])

    expect(result.excluded.unknownInclusionProbability).toBe(1)
  })

  // Without the judge that produced it, the session's harm status is unknown,
  // which is not the same as knowing it was clean.
  it("excludes a session whose harm came from an unsupported judge", () => {
    const result = estimate([examined("session-1", { harmed: true, harmVersion: "safety-v1:other/model" })])

    expect(result).toMatchObject({
      examinedSessionCount: 0,
      excluded: expect.objectContaining({ incompatibleJudgmentVersion: 1 }),
    })
  })

  it("unions several detectors on one session into one harmed session", () => {
    const result = estimate([
      { ...examined("session-1", { harmed: true }), harmJudgmentVersions: [JUDGE, JUDGE] },
      ...cleanSessions(9, 1),
    ])

    expect(result.harmedSessionCount).toBe(1)
    expect(result.examinedSessionCount).toBe(10)
  })
})

describe("estimateProjectSafety arithmetic", () => {
  it("compounds the clean rate over the reference run", () => {
    const result = estimate([...cleanSessions(99), examined("session-harmed", { harmed: true })])

    // One harm in a hundred uniformly sampled sessions is a rate of 0.01
    // whatever the shared probability was, so the survival is 0.99 ^ 100, the
    // reference-run horizon.
    expect(result.harmRate).toBeCloseTo(0.01, 10)
    expect(result.safety).toBeCloseTo(100 * 0.99 ** 100, 8)
  })

  // The horizon and the examined floor are chosen together: a shorter run is
  // what lets a readable population distinguish harm rates at all.
  it("pins the shipped horizon to the figures the specification quotes", () => {
    const oneInAHundred = estimate([...cleanSessions(99), examined("h-1", { harmed: true })])
    const oneInAThousand = estimate([...cleanSessions(999), examined("h-1", { harmed: true })])

    expect(oneInAHundred.safety).toBeCloseTo(36.6, 1)
    expect(oneInAThousand.safety).toBeCloseTo(90.5, 1)
  })

  it("reports a clean window as a hundred with a lower bound that is not certainty", () => {
    const result = estimate(cleanSessions(200))

    expect(result.safety).toBe(100)
    expect(result.interval?.upper).toBe(100)
    expect(result.interval?.lower).toBeGreaterThan(0)
    expect(result.interval?.lower).toBeLessThan(100)
  })

  // The transform is monotone decreasing, so the harm-rate upper bound has to
  // come out as the score's lower bound.
  it("keeps the interval ordered through the decreasing transform", () => {
    const result = estimate([...cleanSessions(99), examined("session-harmed", { harmed: true })])

    expect(result.interval?.lower).toBeLessThanOrEqual(result.safety ?? 0)
    expect(result.interval?.upper).toBeGreaterThanOrEqual(result.safety ?? 0)
  })

  it("falls as more of the same population turns out harmed", () => {
    const one = estimate([...cleanSessions(99), examined("h-1", { harmed: true })])
    const two = estimate([...cleanSessions(98), examined("h-1", { harmed: true }), examined("h-2", { harmed: true })])

    expect(two.safety).toBeLessThan(one.safety ?? 0)
  })

  it("labels a window that changed its sampling rate as stratified", () => {
    const uniform = estimate(cleanSessions(10))
    const mixed = estimate([
      ...cleanSessions(5),
      ...Array.from({ length: 5 }, (_, index) => examined(`late-${index}`, { probability: 0.5 })),
    ])

    expect(uniform.intervalMethod).toBe("exactBinomial")
    expect(mixed.intervalMethod).toBe("stratifiedBinomial")
  })

  it("weights a rarely sampled harm by the sessions it stands for", () => {
    const rare = estimate([...cleanSessions(99), examined("h-1", { harmed: true, probability: 0.01 })])
    const common = estimate([...cleanSessions(99), examined("h-1", { harmed: true, probability: 1 })])

    expect(rare.harmRate).toBeGreaterThan(common.harmRate ?? 0)
  })
})

describe("estimateProjectSafety coverage gates", () => {
  it("withholds a number below the examined floor without inventing one", () => {
    const result = estimate(cleanSessions(5), { floors: { ...OPEN_FLOORS, examinedSessions: 10 } })

    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "examinedFloor" })
    expect(result.safety).toBeUndefined()
    expect(result.interval).toBeUndefined()
  })

  it("withholds a number when the examined population describes too little of the base", () => {
    const result = estimate(cleanSessions(10), {
      eligibleSessionCount: 1_000,
      floors: { ...OPEN_FLOORS, examinedShareOfEligible: 0.5 },
    })

    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "coverageFloor" })
  })

  // Hinted sessions are the ones most likely to contain harm, so losing them to
  // the limiter biases the rate downward rather than merely shrinking it.
  it("withholds a number when the limiter dropped too much of the hinted stratum", () => {
    const rateLimited = Array.from(
      { length: 5 },
      (_, index): SafetySessionExamination => ({
        sessionId: `limited-${index}`,
        decisions: SUITE.map((slug) =>
          pending(slug, {
            selected: false,
            reason: "rate-limited",
            inclusionProbability: 1,
            hintKinds: ["pattern:pii"],
          }),
        ),
        harmJudgmentVersions: [],
      }),
    )
    const hinted = Array.from({ length: 5 }, (_, index) => examined(`hinted-${index}`, { hinted: true }))
    const result = estimate([...hinted, ...rateLimited], {
      floors: { ...OPEN_FLOORS, maxRateLimitedHintedShare: 0.1 },
    })

    expect(result.rateLimitedHintedCount).toBe(5)
    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "rateLimitedHintedFloor" })
  })

  it("counts rate-limited hinted sessions without letting them gate an ordinary window", () => {
    const result = estimate(cleanSessions(10))

    expect(result.rateLimitedHintedCount).toBe(0)
    expect(result.coverage).toBe("measured")
  })
})
