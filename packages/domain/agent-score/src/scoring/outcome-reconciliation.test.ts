import type { FlaggerScreeningDecision } from "@domain/flaggers"
import type { Score } from "@domain/scores"
import { OrganizationId, ProjectId, ScoreId, SessionId, TraceId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { AssessmentFinding, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { resolveSessionAssessment } from "../resolver/resolve-session-assessment.ts"
import { buildIssueRows, type IssueSession } from "./build-issue-rows.ts"
import { estimateProjectOutcome, type OutcomeSessionVerdict } from "./estimate-outcome.ts"
import { readOutcomeIssueObservations } from "./read-outcome-issue-observations.ts"
import { selectDeterministicOutcomeFailures } from "./select-outcome-endpoints.ts"

/**
 * One judged session, followed through every layer it touches.
 *
 * The layers are wired together only in PR 6, so nothing else proves they agree
 * about the same session: the screening decision that selected it, the score the
 * judge wrote, the assessment item a user reads, the estimator's input, and the
 * issue row that explains it all have to describe one event.
 */
const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const SESSION_ID = SessionId("judged-session")
const TRACE_ID = TraceId("t".repeat(32))
const ANALYSIS_HASH = "a".repeat(64)
const JUDGMENT_VERSION = "task-failure-v1:amazon-bedrock/anthropic.claude-haiku-4-5"
const INCLUSION_PROBABILITY = 0.1
const FEEDBACK = "The cancellation never happened and the user asked twice."

const screeningDecision: FlaggerScreeningDecision = {
  decisionId: "d".repeat(64),
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  sessionId: SESSION_ID,
  flaggerSlug: "task-failure",
  analysisHash: ANALYSIS_HASH,
  scoringArtifactVersion: "flagger-screening-v1",
  attempt: 1,
  version: 2,
  selected: true,
  reason: "ordinary-sample",
  inclusionProbability: INCLUSION_PROBABILITY,
  hintKinds: [],
  outcome: "failure",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  retentionDays: 90,
}

const verdictScore = {
  id: ScoreId("score-judged-session-xxxx"),
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  sessionId: SESSION_ID,
  traceId: TRACE_ID,
  spanId: null,
  simulationId: null,
  signalId: null,
  sourceType: "annotation",
  sourceId: "SYSTEM",
  value: 0,
  passed: false,
  feedback: FEEDBACK,
  metadata: {
    rawFeedback: FEEDBACK,
    flaggerSlug: "task-failure",
    flaggerPath: "sampled",
    analysisHash: ANALYSIS_HASH,
    scoringArtifactVersion: JUDGMENT_VERSION,
    messageIndex: 3,
  },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  annotatorId: null,
  createdAt: new Date("2026-01-01T00:05:00.000Z"),
  updatedAt: new Date("2026-01-01T00:05:00.000Z"),
} as Score

const verdictFinding: AssessmentFinding = {
  evidenceKey: `score:${verdictScore.id}`,
  label: "Task failure",
  description: FEEDBACK,
  source: "flagger",
  metricId: "sessions.task_success",
  signalIds: [],
  scoreIds: [verdictScore.id],
  occurrenceCount: 1,
  chronology: { occurredAt: verdictScore.createdAt, messageIndex: 3 },
  anchors: [{ kind: "message", traceId: TRACE_ID, messageIndex: 3 }],
  destinations: [{ kind: "score", scoreId: verdictScore.id }],
  independentHumanEvidence: false,
  kind: "taskOutcome",
  verdict: "failure",
}

const momentFinding: AssessmentFinding = {
  evidenceKey: "moment:m1",
  label: "Users corrected or abandoned",
  source: "moment",
  metricId: "moments.conversation",
  signalIds: [],
  scoreIds: [],
  occurrenceCount: 1,
  chronology: { occurredAt: new Date("2026-01-01T00:02:00.000Z") },
  anchors: [],
  destinations: [],
  independentHumanEvidence: false,
  kind: "moment",
  momentKinds: ["user_correction"],
}

const assessmentInput: NormalizedSessionAssessmentInput = {
  sessionId: SESSION_ID,
  hasReadableUserTask: true,
  observedMicrocents: 0,
  observedDurationNs: 0,
  findings: [verdictFinding, momentFinding],
  readers: [],
  screeningDecisions: [screeningDecision],
}

describe("one judged session across every Outcome layer", () => {
  const assessment = resolveSessionAssessment(assessmentInput)
  const verdictItem = assessment.items.find((item) => item.metricId === "sessions.task_success")

  it("shows the judge's own words against the session, with no score of its own", () => {
    expect(verdictItem).toMatchObject({
      label: "Task failure",
      description: FEEDBACK,
      polarity: "negative",
      scoreIds: [verdictScore.id],
    })
    expect(assessment).not.toHaveProperty("score")
    expect(assessment.dimensions.every((dimension) => !("score" in dimension))).toBe(true)
  })

  it("reports the decision's selection as the session's coverage", () => {
    expect(assessment.coverage.readers).toContainEqual(
      expect.objectContaining({
        readerId: "flagger:task-failure",
        status: "examined",
        selection: { method: "ordinary-sample", inclusionProbability: INCLUSION_PROBABILITY },
      }),
    )
  })

  it("carries the same verdict and probability into the estimator", () => {
    const metadata = verdictScore.metadata as { scoringArtifactVersion: string }
    const verdict: OutcomeSessionVerdict = {
      sessionId: SESSION_ID,
      succeeded: verdictScore.passed,
      inclusionProbability: screeningDecision.inclusionProbability!,
      judgmentVersion: metadata.scoringArtifactVersion,
    }

    const result = estimateProjectOutcome({
      eligibleSessionCount: 10,
      deterministicFailureSessionIds: selectDeterministicOutcomeFailures([assessmentInput]),
      judgedSessions: [verdict],
      supportedJudgmentVersions: [JUDGMENT_VERSION],
      floors: { examinedSessions: 1, examinedShareOfEligible: 0 },
    })

    // No deterministic endpoint on this session, so the judge is the only
    // evidence and a single failure puts the rate at zero.
    expect(result).toMatchObject({ coverage: "measured", outcome: 0, sampledSessionCount: 1 })
    expect(result.deterministicSessionCount).toBe(0)
  })

  it("explains the failure through the moment, not through the verdict itself", () => {
    const observations = readOutcomeIssueObservations({
      items: assessment.items,
      signals: [],
      observationProbability: 1,
    })

    const issueSession: IssueSession = {
      sessionId: SESSION_ID,
      adverse: true,
      endpointInclusionProbability: INCLUSION_PROBABILITY,
      observations,
    }
    const rows = buildIssueRows({ sessions: [issueSession] })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      label: "Users corrected or abandoned",
      examinedSessions: 1,
      examinedAdverseSessions: 1,
      estimatedReach: 1,
      estimatedAdverseReach: 1 / INCLUSION_PROBABILITY,
      ranked: true,
    })
    expect(rows.some((row) => row.issueKey === verdictItem?.groupKey)).toBe(false)
  })
})
