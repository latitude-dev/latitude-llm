import type { ClassifySessionFlaggerResult } from "@domain/flaggers"
import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { beforeEach, describe, expect, it, vi } from "vitest"

const FLAGGER_TRACE_ID = "f".repeat(32)

const { mockActivities } = vi.hoisted(() => {
  const matched = {
    matched: true as const,
    outcome: "matched" as const,
    feedback: "The assistant refused a benign request.",
    messageIndex: 1,
    flaggerTraceId: "f".repeat(32),
    contentHash: "a".repeat(64),
    latestTraceId: "t".repeat(32),
    sessionStartedAt: "2026-08-17T12:00:00.000Z",
    simulationId: null,
    scoringArtifactVersion: "flagger-classification-v1",
  }
  const mockActivities = {
    classifySessionFlagger: vi.fn(async (): Promise<ClassifySessionFlaggerResult> => matched),
    draftSessionFlaggerAnnotation: vi.fn(async () => ({
      status: "drafted" as const,
      scoreId: "score-1",
      feedback: matched.feedback,
      messageIndex: matched.messageIndex,
    })),
    saveSessionFlaggerAnnotation: vi.fn(async () => ({})),
    saveSessionFlaggerVerdict: vi.fn(async () => undefined),
    saveSessionFlaggerSafetyFinding: vi.fn(async () => undefined),
  }
  return { mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
  log: { info: vi.fn(), warn: vi.fn() },
}))

import { flaggerClassificationWorkflow } from "./flagger-classification-workflow.ts"

const INPUT = {
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  sessionId: "session-1",
  flaggerId: "fl".repeat(12),
  flaggerSlug: "refusal",
  reason: "hinted" as const,
  hints: [],
  screeningSelection: {
    decisionId: "d".repeat(64),
    organizationId: OrganizationId("o".repeat(24)),
    projectId: ProjectId("p".repeat(24)),
    sessionId: SessionId("session-1"),
    flaggerSlug: "refusal" as const,
    analysisHash: "a".repeat(64),
    scoringArtifactVersion: "flagger-screening-v1",
    selected: true,
    reason: "hinted" as const,
    inclusionProbability: 1,
    hintKinds: [],
    retentionDays: 90,
  },
}

describe("flaggerClassificationWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("saves the annotation with the trace of the classification that produced it", async () => {
    const result = await flaggerClassificationWorkflow(INPUT)

    expect(result).toMatchObject({ result: "annotated", scoreId: "score-1" })
    expect(mockActivities.classifySessionFlagger).toHaveBeenCalledWith(
      expect.objectContaining({ screeningSelection: INPUT.screeningSelection }),
    )
    expect(mockActivities.saveSessionFlaggerAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        flaggerTraceId: FLAGGER_TRACE_ID,
        scoringArtifactVersion: "flagger-classification-v1",
      }),
    )
  })

  it("omits the trace when the classification carried none", async () => {
    mockActivities.classifySessionFlagger.mockImplementationOnce(async () => ({
      matched: true,
      outcome: "matched" as const,
      feedback: "The assistant refused a benign request.",
      messageIndex: 1,
      contentHash: "a".repeat(64),
      latestTraceId: "t".repeat(32),
      sessionStartedAt: "2026-08-17T12:00:00.000Z",
      simulationId: null,
      scoringArtifactVersion: "flagger-classification-v1",
    }))

    await flaggerClassificationWorkflow(INPUT)

    expect(mockActivities.saveSessionFlaggerAnnotation).toHaveBeenCalledWith(
      expect.not.objectContaining({ flaggerTraceId: expect.anything() }),
    )
  })

  describe("verdict flaggers", () => {
    const verdict = (outcome: "success" | "failure"): ClassifySessionFlaggerResult => {
      const anchors = {
        feedback: "The subscription was cancelled and the billing date confirmed.",
        messageIndex: 1,
        flaggerTraceId: FLAGGER_TRACE_ID,
        contentHash: "a".repeat(64),
        latestTraceId: "t".repeat(32),
        sessionStartedAt: "2026-08-17T12:00:00.000Z",
        simulationId: null,
        scoringArtifactVersion: "task-failure-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
      }
      return outcome === "success"
        ? { matched: false, outcome: "success", ...anchors }
        : { matched: true, outcome: "failure", ...anchors }
    }

    const VERDICT_INPUT = { ...INPUT, flaggerSlug: "task-failure" as const }

    it.each(["success", "failure"] as const)("saves a %s verdict without drafting an annotation", async (outcome) => {
      mockActivities.classifySessionFlagger.mockImplementationOnce(async () => verdict(outcome))

      const result = await flaggerClassificationWorkflow(VERDICT_INPUT)

      expect(result).toMatchObject({ result: `verdict_${outcome}` })
      expect(mockActivities.saveSessionFlaggerVerdict).toHaveBeenCalledWith(
        expect.objectContaining({
          verdict: outcome,
          analysisHash: INPUT.screeningSelection.analysisHash,
          scoringArtifactVersion: "task-failure-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
          flaggerTraceId: FLAGGER_TRACE_ID,
        }),
      )
      expect(mockActivities.draftSessionFlaggerAnnotation).not.toHaveBeenCalled()
      expect(mockActivities.saveSessionFlaggerAnnotation).not.toHaveBeenCalled()
    })

    it("passes the analysis generation to the classifier so the score can record it", async () => {
      mockActivities.classifySessionFlagger.mockImplementationOnce(async () => verdict("success"))

      await flaggerClassificationWorkflow(VERDICT_INPUT)

      expect(mockActivities.classifySessionFlagger).toHaveBeenCalledWith(
        expect.objectContaining({ analysisHash: INPUT.screeningSelection.analysisHash }),
      )
    })

    it("persists nothing without an analysis generation to scope the verdict to", async () => {
      mockActivities.classifySessionFlagger.mockImplementationOnce(async () => verdict("failure"))

      const result = await flaggerClassificationWorkflow({ ...VERDICT_INPUT, screeningSelection: undefined })

      expect(result).toMatchObject({ result: "skipped_verdict" })
      expect(mockActivities.saveSessionFlaggerVerdict).not.toHaveBeenCalled()
    })

    it.each(["indeterminate", "notApplicable"] as const)("writes no score for %s", async (outcome) => {
      mockActivities.classifySessionFlagger.mockImplementationOnce(async () => ({ matched: false, outcome }))

      const result = await flaggerClassificationWorkflow(VERDICT_INPUT)

      expect(result).toMatchObject({ result: "not_matched" })
      expect(mockActivities.saveSessionFlaggerVerdict).not.toHaveBeenCalled()
      expect(mockActivities.draftSessionFlaggerAnnotation).not.toHaveBeenCalled()
    })
  })

  describe("Safety detectors", () => {
    const anchors = {
      feedback: "An instruction-override attempt arrived in the first user turn.",
      messageIndex: 0,
      flaggerTraceId: FLAGGER_TRACE_ID,
      contentHash: "a".repeat(64),
      latestTraceId: "t".repeat(32),
      sessionStartedAt: "2026-08-17T12:00:00.000Z",
      simulationId: null,
      scoringArtifactVersion: "safety-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
    }

    const finding = (
      safetyFindingKind: "injectionAttempt" | "injectionCompliance" | "injectionDefense" | "piiExposure",
    ): ClassifySessionFlaggerResult =>
      safetyFindingKind === "injectionDefense" || safetyFindingKind === "piiExposure"
        ? { matched: false, outcome: "success", ...anchors, safetyFindingKind }
        : { matched: true, outcome: "matched", ...anchors, safetyFindingKind }

    const SAFETY_INPUT = { ...INPUT, flaggerSlug: "jailbreaking" as const }

    it.each([
      "injectionAttempt",
      "injectionCompliance",
      "injectionDefense",
      "piiExposure",
    ] as const)("saves %s in one step without drafting an annotation", async (safetyFindingKind) => {
      mockActivities.classifySessionFlagger.mockImplementationOnce(async () => finding(safetyFindingKind))

      const result = await flaggerClassificationWorkflow(SAFETY_INPUT)

      expect(result).toMatchObject({ result: `safety_${safetyFindingKind}` })
      expect(mockActivities.saveSessionFlaggerSafetyFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          safetyFindingKind,
          analysisHash: INPUT.screeningSelection.analysisHash,
          scoringArtifactVersion: "safety-v1:amazon-bedrock/anthropic.claude-haiku-4-5",
          flaggerTraceId: FLAGGER_TRACE_ID,
        }),
      )
      expect(mockActivities.draftSessionFlaggerAnnotation).not.toHaveBeenCalled()
      expect(mockActivities.saveSessionFlaggerAnnotation).not.toHaveBeenCalled()
      expect(mockActivities.saveSessionFlaggerVerdict).not.toHaveBeenCalled()
    })

    // The finding kind is the identity, so a generation is provenance the score
    // can do without rather than a reason to drop the judgement.
    it("still persists a finding when no analysis generation is available", async () => {
      mockActivities.classifySessionFlagger.mockImplementationOnce(async () => finding("injectionCompliance"))

      const result = await flaggerClassificationWorkflow({ ...SAFETY_INPUT, screeningSelection: undefined })

      expect(result).toMatchObject({ result: "safety_injectionCompliance" })
      expect(mockActivities.saveSessionFlaggerSafetyFinding).toHaveBeenCalledWith(
        expect.not.objectContaining({ analysisHash: expect.anything() }),
      )
    })

    it("leaves a result with no finding kind on the annotation path", async () => {
      const result = await flaggerClassificationWorkflow(SAFETY_INPUT)

      expect(result).toMatchObject({ result: "annotated" })
      expect(mockActivities.saveSessionFlaggerSafetyFinding).not.toHaveBeenCalled()
      expect(mockActivities.draftSessionFlaggerAnnotation).toHaveBeenCalled()
    })
  })
})
