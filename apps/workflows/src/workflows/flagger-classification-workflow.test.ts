import type { ClassifySessionFlaggerResult } from "@domain/flaggers"
import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { beforeEach, describe, expect, it, vi } from "vitest"

const FLAGGER_TRACE_ID = "f".repeat(32)

const { mockActivities } = vi.hoisted(() => {
  const matched = {
    matched: true as const,
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
  }
  return { mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
  log: { info: vi.fn() },
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
})
