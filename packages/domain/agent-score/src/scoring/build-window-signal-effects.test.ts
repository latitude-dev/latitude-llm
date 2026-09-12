import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import type { CostMetricReading } from "../entities/cost-metric-reading.ts"
import type { AssessmentFinding, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { EMPTY_COST_FAMILY_DENOMINATORS } from "./aggregate-session-cost.ts"
import {
  buildWindowSignalEffects,
  readSessionSignalEvidence,
  type SessionSignalEvidence,
} from "./build-window-signal-effects.ts"

const reading = (overrides: Partial<CostMetricReading> = {}): CostMetricReading =>
  ({
    metricId: "tools.repeated_call",
    family: "tools",
    rawUnit: "toolCalls",
    aggregation: "eventRate",
    applicability: "applicable",
    readability: "readable",
    rawValue: 0.3,
    eligibleUnits: 10,
    adverseUnits: 3,
    observations: [{ atomId: "toolCall:t:1", eligibleUnits: 1, adverseUnits: 1 }],
    evidence: "modeled",
    limitations: [],
    ...overrides,
  }) as CostMetricReading

const signalFinding = (signalId: string, evidenceKey: string): AssessmentFinding =>
  ({
    evidenceKey,
    label: "Signal",
    source: "signal",
    signalIds: [signalId],
    scoreIds: [],
    occurrenceCount: 1,
    chronology: {},
    anchors: [],
    destinations: [],
    independentHumanEvidence: false,
    kind: "classifiedJudgment",
    roles: [{ scoreDimension: "cost", role: "spendEfficiency" }],
    negative: true,
    judgmentKind: "evaluation",
  }) as AssessmentFinding

const session = ({
  sessionId,
  findings = [],
  readings = [reading()],
  stratum = "openai/gpt-5|from4kTo16k|streaming|medium",
  avoidableNs = 0,
}: {
  readonly sessionId: string
  readonly findings?: readonly AssessmentFinding[]
  readonly readings?: readonly CostMetricReading[]
  readonly stratum?: string
  readonly avoidableNs?: number
}): NormalizedSessionAssessmentInput =>
  ({
    sessionId: SessionId(sessionId),
    hasReadableUserTask: true,
    observedMicrocents: 0,
    observedDurationNs: 0,
    findings,
    readers: [],
    screeningDecisions: [],
    costEvidence: {
      readings,
      workloadStratum: stratum,
      denominators: EMPTY_COST_FAMILY_DENOMINATORS,
      observedCriticalPathNs: 1_000_000,
      criticalPathComplete: true,
      measuredAvoidableNs: avoidableNs,
      estimatedAvoidableNs: 0,
      measuredAvoidableMicrocents: 0,
      estimatedAvoidableMicrocents: 0,
      avoidableNsByCause: { "latency:ttft": avoidableNs },
    },
  }) as NormalizedSessionAssessmentInput

describe("readSessionSignalEvidence", () => {
  it("links an occurrence that lands on a metric the family already charges", () => {
    const evidence = readSessionSignalEvidence(
      session({ sessionId: "s1", findings: [signalFinding("signal-1", "tools.repeated_call")] }),
    )

    expect(evidence.linkedSignalIds).toEqual(["signal-1"])
    expect(evidence.unlinkedSignalIds).toEqual([])
  })

  it("leaves an occurrence unlinked when nothing already charges its evidence", () => {
    const evidence = readSessionSignalEvidence(
      session({ sessionId: "s1", findings: [signalFinding("signal-2", "some.other.finding")] }),
    )

    expect(evidence.unlinkedSignalIds).toEqual(["signal-2"])
  })

  it("takes the family penalty share from the readings, which is the outcome the fit uses", () => {
    const evidence = readSessionSignalEvidence(session({ sessionId: "s1" }))

    expect(evidence.familyPenaltyShare.tools).toBeCloseTo(0.3, 12)
    expect(evidence.familyPenaltyShare.spend).toBe(0)
  })

  it("assigns a stable fold from the session id, so a rerun fits on the same half", () => {
    expect(readSessionSignalEvidence(session({ sessionId: "s1" })).fold).toBe(
      readSessionSignalEvidence(session({ sessionId: "s1" })).fold,
    )
  })

  it("falls back to an unknown stratum, which only ever matches other unknowns", () => {
    const { costEvidence: _costEvidence, ...bare } = session({ sessionId: "s1" })

    expect(readSessionSignalEvidence(bare).stratum).toBe("unknown")
  })
})

const evidenceFor = ({
  exposed,
  clean,
  exposedShare,
  cleanShare,
}: {
  readonly exposed: number
  readonly clean: number
  readonly exposedShare: number
  readonly cleanShare: number
}): SessionSignalEvidence[] => [
  ...Array.from({ length: exposed }, (_, index) =>
    readSessionSignalEvidence(
      session({
        sessionId: `exposed-${index}`,
        findings: [signalFinding("signal-x", "unlinked.finding")],
        readings: [reading({ adverseUnits: exposedShare * 10 })],
        avoidableNs: 400_000,
      }),
    ),
  ),
  ...Array.from({ length: clean }, (_, index) =>
    readSessionSignalEvidence(
      session({
        sessionId: `clean-${index}`,
        readings: [reading({ adverseUnits: cleanShare * 10 })],
        avoidableNs: 100_000,
      }),
    ),
  ),
]

const build = (evidence: readonly SessionSignalEvidence[]) =>
  buildWindowSignalEffects({ evidence, artifact: LAUNCH_COST_SCORING_ARTIFACT })

describe("buildWindowSignalEffects", () => {
  it("adds nothing when no signal occurred", () => {
    expect(build(evidenceFor({ exposed: 0, clean: 10, exposedShare: 0.1, cleanShare: 0.1 }))).toMatchObject({
      costPenalty: 0,
      avoidableNs: 0,
    })
  })

  it("adds nothing for a signal every family already charges", () => {
    const linked = [
      readSessionSignalEvidence(
        session({ sessionId: "s1", findings: [signalFinding("signal-1", "tools.repeated_call")] }),
      ),
    ]

    expect(build(linked)).toMatchObject({ costPenalty: 0, linkedSignalIds: ["signal-1"] })
  })

  it("reports a gap rather than a zero when the comparison has no support", () => {
    const result = build(evidenceFor({ exposed: 1, clean: 1, exposedShare: 0.9, cleanShare: 0.1 }))

    expect(result.costPenalty).toBe(0)
    expect(result.gaps.length).toBeGreaterThan(0)
    expect(result.gaps.every((gap) => gap.support.measured === false)).toBe(true)
  })

  it("measures a difference the clean sessions support, in the family's own share", () => {
    const result = build(evidenceFor({ exposed: 30, clean: 30, exposedShare: 0.8, cleanShare: 0.2 }))

    expect(result.costPenalty).toBeGreaterThan(0)
    expect(result.costResiduals.some((residual) => residual.signalId === "signal-x")).toBe(true)
  })

  it("never returns a credit when the signal-bearing sessions look better", () => {
    const result = build(evidenceFor({ exposed: 30, clean: 30, exposedShare: 0.1, cleanShare: 0.8 }))

    expect(result.costPenalty).toBe(0)
  })

  it("keeps the total inside the artifact's residual cap", () => {
    const result = build(evidenceFor({ exposed: 40, clean: 40, exposedShare: 1, cleanShare: 0 }))

    expect(result.costPenalty).toBeLessThanOrEqual(LAUNCH_COST_SCORING_ARTIFACT.residualSignalCap)
  })

  it("estimates Speed in nanoseconds and shares no cap with Cost", () => {
    const result = build(evidenceFor({ exposed: 30, clean: 30, exposedShare: 0.5, cleanShare: 0.5 }))

    expect(result.avoidableNs).toBeGreaterThan(0)
    expect(result.avoidableNs).toBeGreaterThan(LAUNCH_COST_SCORING_ARTIFACT.residualSignalCap)
  })

  it("does not compare across workloads, so a bigger stratum is not read as an effect", () => {
    const confounded = [
      ...Array.from({ length: 20 }, (_, index) =>
        readSessionSignalEvidence(
          session({
            sessionId: `big-${index}`,
            stratum: "openai/gpt-5|over64k|streaming|long",
            findings: [signalFinding("signal-x", "unlinked.finding")],
            readings: [reading({ adverseUnits: 8 })],
          }),
        ),
      ),
      ...Array.from({ length: 20 }, (_, index) =>
        readSessionSignalEvidence(
          session({
            sessionId: `small-${index}`,
            stratum: "openai/gpt-5|under1k|streaming|short",
            readings: [reading({ adverseUnits: 1 })],
          }),
        ),
      ),
    ]

    // The exposed sessions are all in one stratum and the clean ones in another, so there is no
    // within-stratum comparison to make and the difference is a workload difference, not an effect.
    expect(build(confounded).costPenalty).toBe(0)
  })
})
