import { beforeEach, describe, expect, it, vi } from "vitest"

const ANALYSIS_HASH = "a".repeat(64)

const { mockActivities, startChild } = vi.hoisted(() => {
  const mockActivities = {
    screenSessionFlaggers: vi.fn(async () => ({
      skipped: null,
      decisions: [],
      classifications: [
        {
          flaggerId: "fl".repeat(12),
          flaggerSlug: "refusal",
          reason: "hinted" as const,
          screeningSelection: {
            decisionId: "d".repeat(64),
            organizationId: "o".repeat(24),
            projectId: "p".repeat(24),
            sessionId: "session-1",
            flaggerSlug: "refusal",
            analysisHash: ANALYSIS_HASH,
            scoringArtifactVersion: "flagger-screening-v1",
            selected: true,
            reason: "hinted" as const,
            inclusionProbability: 1,
            hintKinds: [],
            retentionDays: 90,
          },
        },
      ],
    })),
  }
  const startChild = vi.fn(async () => ({}))
  return { mockActivities, startChild }
})

vi.mock("@temporalio/workflow", () => ({
  ParentClosePolicy: { ABANDON: "ABANDON" },
  log: { info: vi.fn(), warn: vi.fn() },
  proxyActivities: () => mockActivities,
  startChild: startChild,
}))

vi.mock("./flagger-classification-workflow.ts", () => ({
  flaggerClassificationWorkflow: "flaggerClassificationWorkflow",
}))

import { flaggerScreeningWorkflow } from "./flagger-screening-workflow.ts"

describe("flaggerScreeningWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("starts one classification child per generation so overlapping screens do not drop work", async () => {
    await flaggerScreeningWorkflow({
      organizationId: "o".repeat(24),
      projectId: "p".repeat(24),
      sessionId: "session-1",
      analysisHash: ANALYSIS_HASH,
    })

    expect(startChild).toHaveBeenCalledWith(
      "flaggerClassificationWorkflow",
      expect.objectContaining({
        workflowId: `flagger-classification:session-1:refusal:${ANALYSIS_HASH.slice(0, 16)}`,
      }),
    )
  })
})
