import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, childExecutions, mockActivities } = vi.hoisted(() => {
  const callOrder: string[] = []
  const childExecutions: Array<{ readonly args: unknown[]; readonly workflowId: string }> = []
  const mockActivities = {
    listRecentBackfillSessionsActivity: vi.fn(async () => {
      callOrder.push("list-sessions")
      return [
        {
          sessionId: "session-1",
          triggeringTraceId: "trace-1",
          triggeringStartTime: "2026-06-07T00:00:00.000Z",
        },
        {
          sessionId: "session-2",
          triggeringTraceId: "trace-2",
          triggeringStartTime: "2026-06-07T00:01:00.000Z",
        },
      ]
    }),
    resetSessionIntelligenceForSessionsActivity: vi.fn(async () => {
      callOrder.push("reset-sessions")
    }),
    waitForTaxonomyObservationStabilityActivity: vi.fn(async () => {
      callOrder.push("wait-observations")
    }),
  }
  return { callOrder, childExecutions, mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
  executeChild: async (_workflow: unknown, options: { args: unknown[]; workflowId: string }) => {
    callOrder.push(options.workflowId.includes(":taxonomy:garden:") ? "garden" : "analyze")
    childExecutions.push({ args: options.args, workflowId: options.workflowId })
    return { status: "completed" }
  },
}))

vi.mock("./analyze-session-workflow.ts", () => ({
  analyzeSessionWorkflow: async () => ({ action: "recorded", status: "analyzed", momentCount: 0 }),
}))

vi.mock("./taxonomy-gardening-workflow.ts", () => ({
  gardenTaxonomyWorkflow: async () => ({ status: "completed" }),
}))

import { backfillRecentSessionIntelligenceWorkflow } from "./recent-session-intelligence-backfill-workflow.ts"

const input = {
  organizationId: "org-1",
  projectId: "project-1",
  sessionLimit: 500,
  startedAfter: "2026-06-07T00:00:00.000Z",
  sessionConcurrency: 1,
}

describe("backfillRecentSessionIntelligenceWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    childExecutions.length = 0
    vi.clearAllMocks()
  })

  it("resets only selected sessions before analyzing and gardening", async () => {
    const result = await backfillRecentSessionIntelligenceWorkflow(input)

    expect(result).toEqual({ action: "completed", sessionsFound: 2 })
    expect(mockActivities.listRecentBackfillSessionsActivity).toHaveBeenCalledWith(input)
    expect(mockActivities.resetSessionIntelligenceForSessionsActivity).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      sessionIds: ["session-1", "session-2"],
    })
    expect(callOrder).toEqual(["list-sessions", "reset-sessions", "analyze", "analyze", "wait-observations", "garden"])
    expect(childExecutions).toEqual([
      {
        args: [
          {
            organizationId: "org-1",
            projectId: "project-1",
            sessionId: "session-1",
            triggeringTraceId: "trace-1",
            triggeringStartTime: "2026-06-07T00:00:00.000Z",
            reason: "backfill",
          },
        ],
        workflowId: "org:org-1:conversation-intelligence:recentBackfillAnalyzeSession:project-1:session-1",
      },
      {
        args: [
          {
            organizationId: "org-1",
            projectId: "project-1",
            sessionId: "session-2",
            triggeringTraceId: "trace-2",
            triggeringStartTime: "2026-06-07T00:01:00.000Z",
            reason: "backfill",
          },
        ],
        workflowId: "org:org-1:conversation-intelligence:recentBackfillAnalyzeSession:project-1:session-2",
      },
      {
        args: [{ organizationId: "org-1", projectId: "project-1", dimension: "topic", trigger: "manual" }],
        workflowId: "org:org-1:taxonomy:garden:project-1:recent-backfill",
      },
    ])
  })
})
