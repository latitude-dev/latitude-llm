import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { AssessmentFinding, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { buildIssueRows } from "./build-issue-rows.ts"
import { buildWindowIssues, readSessionIssueEvidence } from "./build-window-issues.ts"
import type { ProjectOutcomeEstimate } from "./estimate-outcome.ts"
import type { ProjectSafetyEstimate } from "./estimate-safety.ts"

const reference = {
  evidenceKey: "evidence",
  label: "Refund loop",
  source: "signal" as const,
  scoreIds: [],
  occurrenceCount: 1,
  chronology: {},
  anchors: [],
  destinations: [],
  independentHumanEvidence: false,
}

const verdictFinding = (scoreId: string): AssessmentFinding =>
  ({
    ...reference,
    evidenceKey: "verdict",
    label: "Task failure",
    source: "score",
    metricId: "sessions.task_success",
    signalIds: [],
    scoreIds: [scoreId],
    kind: "taskOutcome",
    verdict: "failure",
  }) as AssessmentFinding

const outcomeSignalFinding = (
  signalId: string,
  scoreIds: readonly string[] = [],
  observationProbability = 0.1,
): AssessmentFinding =>
  ({
    ...reference,
    signalIds: [signalId],
    scoreIds,
    observationProbability,
    kind: "classifiedJudgment",
    roles: [{ scoreDimension: "outcome", role: "taskOutcome" }],
    negative: true,
    judgmentKind: "evaluation",
  }) as AssessmentFinding

const finishFailureFinding = (): AssessmentFinding =>
  ({
    ...reference,
    evidenceKey: "span:generation-error",
    label: "Generation ended with generationError",
    source: "metric",
    metricId: "spans.finish_failure",
    signalIds: [],
    scoreIds: [],
    kind: "finishFailure",
    findingKind: "generationError",
    generationPosition: "final",
    observedMicrocents: 0,
    observedNs: 1_000,
  }) as AssessmentFinding

const momentFinding = (evidenceKey = "moment:stall-1"): AssessmentFinding =>
  ({
    ...reference,
    evidenceKey,
    label: "Assistant stalls without delivering progress",
    source: "moment",
    metricId: "moments.conversation",
    signalIds: [],
    scoreIds: [],
    kind: "moment",
    momentKinds: ["stalling"],
  }) as AssessmentFinding

const harmFinding = (): AssessmentFinding =>
  ({
    ...reference,
    evidenceKey: "harm",
    label: "Assistant disclosed personal data",
    signalIds: [],
    kind: "safetyFinding",
    findingKind: "piiDisclosure",
  }) as AssessmentFinding

const session = ({
  sessionId,
  findings,
  eligibleSignalIds = [],
  slug = "task-failure",
  probability = 0.1,
  momentsAnalyzed = true,
}: {
  readonly sessionId: string
  readonly findings: readonly AssessmentFinding[]
  readonly eligibleSignalIds?: readonly string[]
  readonly slug?: string
  readonly probability?: number
  readonly momentsAnalyzed?: boolean
}): NormalizedSessionAssessmentInput =>
  ({
    sessionId: SessionId(sessionId),
    hasReadableUserTask: true,
    momentsAnalyzed,
    observedMicrocents: 0,
    observedDurationNs: 0,
    findings,
    readers: [],
    scoringEligibleSignalIds: eligibleSignalIds,
    screeningDecisions: [{ flaggerSlug: slug, inclusionProbability: probability }],
  }) as unknown as NormalizedSessionAssessmentInput

const outcomeEstimate = (overrides: Partial<ProjectOutcomeEstimate> = {}): ProjectOutcomeEstimate =>
  ({
    coverage: "measured",
    judgedSessions: [],
    deterministicFailureSessionIds: [],
    ...overrides,
  }) as ProjectOutcomeEstimate

const safetyEstimate = (overrides: Partial<ProjectSafetyEstimate> = {}): ProjectSafetyEstimate =>
  ({ coverage: "measured", examinedSessions: [], ...overrides }) as ProjectSafetyEstimate

describe("readSessionIssueEvidence", () => {
  it("keeps an eligible signal's occurrence as an Outcome issue", () => {
    const evidence = readSessionIssueEvidence(
      session({ sessionId: "s1", findings: [outcomeSignalFinding("signal-1")], eligibleSignalIds: ["signal-1"] }),
    )

    expect(evidence.outcome).toHaveLength(1)
    expect(evidence.outcome[0]?.signalId).toBe("signal-1")
  })

  it("drops an ignored signal, so triage cannot move the score's explanation", () => {
    const evidence = readSessionIssueEvidence(
      session({ sessionId: "s1", findings: [outcomeSignalFinding("signal-1")], eligibleSignalIds: [] }),
    )

    expect(evidence.outcome).toEqual([])
  })

  it("carries the reader's own draw as the observation probability", () => {
    const evidence = readSessionIssueEvidence(
      session({
        sessionId: "s1",
        findings: [outcomeSignalFinding("signal-1", [], 0.25)],
        eligibleSignalIds: ["signal-1"],
        probability: 0.25,
      }),
    )

    expect(evidence.outcome[0]?.observationProbability).toBe(0.25)
  })

  it("treats deterministic findings and stored conversation moments as census observations", () => {
    const deterministic = readSessionIssueEvidence(
      session({ sessionId: "failure", findings: [finishFailureFinding()], probability: 0.1 }),
    )
    const moment = readSessionIssueEvidence(
      session({ sessionId: "stall", findings: [momentFinding()], probability: 0.1 }),
    )

    expect(deterministic.outcome[0]?.observationProbability).toBe(1)
    expect(moment.outcome[0]?.observationProbability).toBe(1)
  })

  it("reads a moment against the analyzed sessions rather than the whole window", () => {
    const moment = readSessionIssueEvidence(session({ sessionId: "stall", findings: [momentFinding()] }))
    const deterministic = readSessionIssueEvidence(
      session({ sessionId: "failure", findings: [finishFailureFinding()] }),
    )

    expect(moment.outcome[0]?.basis).toBe("analyzed")
    // A deterministic reader saw every eligible session, so it keeps the wider denominator.
    expect(deterministic.outcome[0]?.basis).toBeUndefined()
  })

  it("leaves a moment uncorrected when analysis never ran, rather than assuming it was certain", () => {
    const unanalyzed = readSessionIssueEvidence(
      session({ sessionId: "stall", findings: [momentFinding()], momentsAnalyzed: false }),
    )

    expect(unanalyzed.outcome[0]?.basis).toBe("analyzed")
    expect(unanalyzed.outcome[0]?.observationProbability).toBeUndefined()

    const rows = buildIssueRows({
      sessions: [
        {
          sessionId: "stall",
          adverse: true,
          endpointInclusionProbability: 1,
          observations: unanalyzed.outcome,
        },
      ],
      basisSessionCounts: { eligible: 1, analyzed: 0 },
    })

    // Unrankable rather than ranked on a denominator nobody established: an absent analysis is a
    // coverage gap, and a coverage gap must never read as a corrected estimate.
    expect(rows[0]).toMatchObject({ ranked: false, basis: "analyzed", basisSessionCount: 0 })
    expect(rows[0]?.estimatedReach).toBeUndefined()
  })

  it("routes confirmed harm to the harm table and not to exposure", () => {
    const evidence = readSessionIssueEvidence(
      session({ sessionId: "s1", findings: [harmFinding()], slug: "pii-leakage" }),
    )

    expect(evidence.safety.confirmedHarm).toHaveLength(1)
    expect(evidence.safety.exposure).toEqual([])
  })
})

describe("buildWindowIssues", () => {
  const evidence = [
    readSessionIssueEvidence(
      session({ sessionId: "failed", findings: [outcomeSignalFinding("signal-1")], eligibleSignalIds: ["signal-1"] }),
    ),
    readSessionIssueEvidence(
      session({ sessionId: "passed", findings: [outcomeSignalFinding("signal-1")], eligibleSignalIds: ["signal-1"] }),
    ),
    readSessionIssueEvidence(session({ sessionId: "excluded", findings: [outcomeSignalFinding("signal-1")] })),
  ]

  it("multiplies two independent draws, because the issue and the endpoint were sampled separately", () => {
    const issues = buildWindowIssues({
      evidence,
      outcome: outcomeEstimate({
        judgedSessions: [
          { sessionId: "failed", succeeded: false, inclusionProbability: 0.1, judgmentVersion: "v1" },
          { sessionId: "passed", succeeded: true, inclusionProbability: 0.1, judgmentVersion: "v1" },
        ],
      }),
      safety: safetyEstimate(),
    })

    // Reach is corrected by the issue's own draw: two sessions seen a tenth of the time stand for
    // twenty. Adverse reach needs the endpoint too, so it corrects by both draws together.
    expect(issues.outcome[0]?.estimatedReach).toBeCloseTo(20, 6)
    expect(issues.outcome[0]?.estimatedAdverseReach).toBeCloseTo(100, 6)
    expect(issues.outcome[0]?.examinedSessions).toBe(2)
  })

  it("corrects a conversation moment only for the sampled Outcome endpoint", () => {
    const moment = [readSessionIssueEvidence(session({ sessionId: "failed", findings: [momentFinding()] }))]
    const issues = buildWindowIssues({
      evidence: moment,
      outcome: outcomeEstimate({
        judgedSessions: [{ sessionId: "failed", succeeded: false, inclusionProbability: 0.1, judgmentVersion: "v1" }],
      }),
      safety: safetyEstimate(),
    })

    expect(issues.outcome[0]).toMatchObject({
      estimatedReach: 1,
      estimatedAdverseReach: 10,
      examinedSessions: 1,
      examinedAdverseSessions: 1,
    })
  })

  it("does not inflate a deterministic finding by the Outcome judge's sampling rate", () => {
    const deterministic = [
      readSessionIssueEvidence(session({ sessionId: "failed", findings: [finishFailureFinding()] })),
    ]
    const issues = buildWindowIssues({
      evidence: deterministic,
      outcome: outcomeEstimate({ deterministicFailureSessionIds: ["failed"] }),
      safety: safetyEstimate(),
    })

    expect(issues.outcome[0]).toMatchObject({
      estimatedReach: 1,
      estimatedAdverseReach: 1,
      examinedSessions: 1,
      examinedAdverseSessions: 1,
    })
  })

  it("describes only the sessions the estimator used", () => {
    const issues = buildWindowIssues({
      evidence,
      outcome: outcomeEstimate({
        judgedSessions: [{ sessionId: "failed", succeeded: false, inclusionProbability: 0.1, judgmentVersion: "v1" }],
      }),
      safety: safetyEstimate(),
    })

    // "excluded" carried the same signal but never entered the rate, so it is not in the row either.
    expect(issues.outcome[0]?.examinedSessions).toBe(1)
  })

  it("gives a deterministic failure a certain endpoint, so only the issue's own draw corrects it", () => {
    const issues = buildWindowIssues({
      evidence,
      outcome: outcomeEstimate({ deterministicFailureSessionIds: ["failed"] }),
      safety: safetyEstimate(),
    })

    // The session failed for certain, so only the signal's own draw corrects its reach.
    expect(issues.outcome[0]?.estimatedReach).toBeCloseTo(10, 6)
    expect(issues.outcome[0]?.estimatedAdverseReach).toBeCloseTo(10, 6)
  })

  it("does not square the draw when the issue rode the verdict that judged the session", () => {
    const shared = [
      readSessionIssueEvidence(
        session({
          sessionId: "failed",
          findings: [verdictFinding("score-1"), outcomeSignalFinding("signal-1", ["score-1"])],
          eligibleSignalIds: ["signal-1"],
        }),
      ),
    ]
    const issues = buildWindowIssues({
      evidence: shared,
      outcome: outcomeEstimate({
        judgedSessions: [{ sessionId: "failed", succeeded: false, inclusionProbability: 0.1, judgmentVersion: "v1" }],
      }),
      safety: safetyEstimate(),
    })

    // One draw, rolled once: ten sessions, not a hundred.
    expect(issues.outcome[0]?.estimatedAdverseReach).toBeCloseTo(10, 6)
  })

  it("builds the two Safety tables from the examined population", () => {
    const harmed = [
      readSessionIssueEvidence(session({ sessionId: "h1", findings: [harmFinding()], slug: "pii-leakage" })),
    ]
    const issues = buildWindowIssues({
      evidence: harmed,
      outcome: outcomeEstimate(),
      safety: safetyEstimate({
        examinedSessions: [{ sessionId: "h1", harmed: true, examinationProbability: 0.1 }],
      }),
    })

    expect(issues.safety.confirmedHarm[0]?.estimatedAdverseReach).toBeCloseTo(10, 6)
    expect(issues.safety.exposure).toEqual([])
  })

  it("returns empty tables when neither dimension examined anything", () => {
    expect(buildWindowIssues({ evidence: [], outcome: outcomeEstimate(), safety: safetyEstimate() })).toEqual({
      outcome: [],
      safety: { confirmedHarm: [], exposure: [] },
    })
  })
})
