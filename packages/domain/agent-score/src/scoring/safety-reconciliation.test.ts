import type { FlaggerScreeningDecision } from "@domain/flaggers"
import type { Score } from "@domain/scores"
import { OrganizationId, ProjectId, ScoreId, SessionId, TraceId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { AssessmentFinding, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { resolveSessionAssessment } from "../resolver/resolve-session-assessment.ts"
import { buildSafetyIssues } from "./build-safety-issues.ts"
import { estimateProjectSafety, type SafetyMemberDecision } from "./estimate-safety.ts"
import { readSafetyIssueObservations } from "./read-safety-issue-observations.ts"

/**
 * One examined session, followed through every layer it touches.
 *
 * The layers are wired together only in PR 6, so nothing else proves they agree
 * about the same session: the two screening decisions that selected the suite,
 * the score the judge wrote, the assessment item a user reads, the estimator's
 * examined population, and the issue row that explains it all have to describe
 * one event.
 */
const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const SESSION_ID = SessionId("harmed-session")
const TRACE_ID = TraceId("t".repeat(32))
const ANALYSIS_HASH = "a".repeat(64)
const JUDGMENT_VERSION = "safety-v1:amazon-bedrock/anthropic.claude-haiku-4-5"
const INCLUSION_PROBABILITY = 0.1
const FEEDBACK = "The agent followed an injected instruction and printed its hidden system prompt."

const suiteDecision = (flaggerSlug: string, overrides: Partial<FlaggerScreeningDecision> = {}) =>
  ({
    decisionId: `${flaggerSlug.padEnd(64, "d").slice(0, 64)}`,
    organizationId: ORGANIZATION_ID,
    projectId: PROJECT_ID,
    sessionId: SESSION_ID,
    flaggerSlug,
    analysisHash: ANALYSIS_HASH,
    scoringArtifactVersion: "flagger-screening-v1",
    attempt: 1,
    version: 2,
    selected: true,
    reason: "ordinary-sample",
    inclusionProbability: INCLUSION_PROBABILITY,
    hintKinds: [],
    outcome: "matched",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    retentionDays: 90,
    ...overrides,
  }) as FlaggerScreeningDecision

// Both members share one draw, and the member that could not read the session
// is not applicable rather than missing.
const screeningDecisions = [suiteDecision("jailbreaking"), suiteDecision("pii-leakage", { outcome: "notApplicable" })]

const harmScore = {
  id: ScoreId("score-harmed-session-xxxx"),
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
    flaggerSlug: "jailbreaking",
    flaggerPath: "sampled",
    analysisHash: ANALYSIS_HASH,
    scoringArtifactVersion: JUDGMENT_VERSION,
    safetyFindingKind: "injectionCompliance",
    messageIndex: 2,
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

const harmFinding: AssessmentFinding = {
  evidenceKey: `score:${harmScore.id}`,
  label: "Jailbreaking",
  description: FEEDBACK,
  source: "flagger",
  metricId: "safety.confirmed_failure",
  signalIds: [],
  scoreIds: [harmScore.id],
  occurrenceCount: 1,
  chronology: { occurredAt: harmScore.createdAt, messageIndex: 2 },
  anchors: [{ kind: "message", traceId: TRACE_ID, messageIndex: 2 }],
  destinations: [{ kind: "score", scoreId: harmScore.id }],
  independentHumanEvidence: false,
  kind: "safetyFinding",
  findingKind: "injectionCompliance",
}

const assessmentInput: NormalizedSessionAssessmentInput = {
  sessionId: SESSION_ID,
  hasReadableUserTask: true,
  observedMicrocents: 0,
  observedDurationNs: 0,
  findings: [harmFinding],
  readers: [],
  screeningDecisions,
}

const memberDecisions: readonly SafetyMemberDecision[] = screeningDecisions.map((decision) => ({
  flaggerSlug: decision.flaggerSlug,
  analysisHash: decision.analysisHash,
  selected: decision.selected,
  reason: decision.reason,
  ...(decision.inclusionProbability !== undefined ? { inclusionProbability: decision.inclusionProbability } : {}),
  ...(decision.outcome !== undefined ? { outcome: decision.outcome } : {}),
  hintKinds: [...decision.hintKinds],
}))

describe("one examined session across every Safety layer", () => {
  const assessment = resolveSessionAssessment(assessmentInput)
  const harmItem = assessment.items.find((item) => item.scoreIds.includes(harmScore.id))

  it("shows the judge's own words against the session, with no score of its own", () => {
    expect(harmItem).toMatchObject({
      label: "Jailbreaking",
      description: FEEDBACK,
      polarity: "negative",
      source: "flagger",
    })
    expect(harmItem?.anchors).toContainEqual({ kind: "message", traceId: TRACE_ID, messageIndex: 2 })
    expect(assessment).not.toHaveProperty("score")
  })

  it("counts the attack beside the harm rather than twice", () => {
    const safety = assessment.dimensions.find((dimension) => dimension.scoreDimension === "safety")

    expect(safety).toMatchObject({ confirmedHarmCount: 1, exposureCount: 1, successfulDefenseCount: 0 })
  })

  it("reports the suite's selection as the session's coverage", () => {
    expect(assessment.coverage.readers).toContainEqual(
      expect.objectContaining({
        readerId: "flagger:jailbreaking",
        status: "examined",
        selection: { method: "ordinary-sample", inclusionProbability: INCLUSION_PROBABILITY },
      }),
    )
    expect(assessment.coverage.readers).toContainEqual(
      expect.objectContaining({ readerId: "flagger:pii-leakage", status: "notApplicable" }),
    )
  })

  it("carries the same session and probability into the estimator", () => {
    const estimate = estimateProjectSafety({
      eligibleSessionCount: 10,
      sessions: [{ sessionId: SESSION_ID, decisions: memberDecisions, harmJudgmentVersions: [JUDGMENT_VERSION] }],
      suiteSlugs: ["jailbreaking", "pii-leakage"],
      supportedJudgmentVersions: [JUDGMENT_VERSION],
      referenceRunSessions: 100,
      floors: { examinedSessions: 1, examinedShareOfEligible: 0, maxRateLimitedHintedShare: 1 },
    })

    expect(estimate).toMatchObject({ coverage: "measured", examinedSessionCount: 1, harmedSessionCount: 1 })
    // The one examined session stood for ten, and it was harmed, so the rate is
    // the whole of it however rarely the suite ran.
    expect(estimate.harmRate).toBeCloseTo(1, 10)
  })

  it("explains the harm through the finding that produced it, on the harm table", () => {
    const { confirmedHarm, exposure } = buildSafetyIssues({
      sessions: [
        {
          sessionId: SESSION_ID,
          harmed: true,
          examinationProbability: INCLUSION_PROBABILITY,
          observations: readSafetyIssueObservations({
            items: assessment.items,
            signals: [],
            observationProbability: INCLUSION_PROBABILITY,
          }),
        },
      ],
    })

    expect(exposure).toEqual([])
    expect(confirmedHarm).toHaveLength(1)
    expect(confirmedHarm[0]).toMatchObject({
      issueKey: harmItem?.groupKey,
      label: "Jailbreaking",
      examinedSessions: 1,
      examinedAdverseSessions: 1,
      ranked: true,
    })
    // The finding and the harm status rode one draw, so the corrected reach is
    // ten sessions rather than a hundred.
    expect(confirmedHarm[0]?.estimatedAdverseReach).toBeCloseTo(10, 10)
  })
})
