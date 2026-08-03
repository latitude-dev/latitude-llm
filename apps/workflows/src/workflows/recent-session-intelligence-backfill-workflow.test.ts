import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  callOrder,
  childErrors,
  childExecutions,
  childResults,
  mockActivities,
  mockWorkflowLog,
  parentCancellationState,
  patchedState,
} = vi.hoisted(() => {
  const callOrder: string[] = []
  const childErrors: Record<string, Error> = {}
  const childResults: Record<string, unknown> = {}
  const childExecutions: Array<{ readonly args: unknown[]; readonly workflowId: string }> = []
  const mockWorkflowLog = { warn: vi.fn() }
  const parentCancellationState = { consideredCancelled: false }
  const patchedState: { default: boolean; readonly byId: Record<string, boolean> } = { default: true, byId: {} }
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
  return {
    callOrder,
    childErrors,
    childExecutions,
    childResults,
    mockActivities,
    mockWorkflowLog,
    parentCancellationState,
    patchedState,
  }
})

vi.mock("@temporalio/workflow", () => ({
  CancellationScope: { current: () => parentCancellationState },
  patched: (id: string) => patchedState.byId[id] ?? patchedState.default,
  proxyActivities: () => mockActivities,
  isCancellation: (error: unknown) => error instanceof Error && error.name === "CancelledFailure",
  log: mockWorkflowLog,
  executeChild: async (_workflow: unknown, options: { args: unknown[]; workflowId: string }) => {
    callOrder.push(options.workflowId.includes(":taxonomy:garden:") ? "garden" : "analyze")
    childExecutions.push({ args: options.args, workflowId: options.workflowId })
    const sessionId = (options.args[0] as { readonly sessionId?: string }).sessionId
    if (sessionId) {
      if (childErrors[sessionId]) throw childErrors[sessionId]
      return childResults[sessionId] ?? { action: "recorded", status: "analyzed", momentCount: 0 }
    }
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
    for (const sessionId of Object.keys(childErrors)) delete childErrors[sessionId]
    for (const sessionId of Object.keys(childResults)) delete childResults[sessionId]
    parentCancellationState.consideredCancelled = false
    patchedState.default = true
    for (const id of Object.keys(patchedState.byId)) delete patchedState.byId[id]
    vi.clearAllMocks()
  })

  it("resets only selected sessions before analyzing and gardening", async () => {
    const result = await backfillRecentSessionIntelligenceWorkflow(input)

    expect(result).toEqual({
      action: "completed",
      sessionsFound: 2,
      sessionsCompleted: 2,
      sessionsFailed: 0,
      failedSessionIds: [],
      failedSessionIdsTruncated: false,
    })
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

  it("continues subsequent batches after a child failure and still gardens", async () => {
    childErrors["session-1"] = new Error("analysis failed")

    await expect(backfillRecentSessionIntelligenceWorkflow(input)).resolves.toEqual({
      action: "completed",
      sessionsFound: 2,
      sessionsCompleted: 1,
      sessionsFailed: 1,
      failedSessionIds: ["session-1"],
      failedSessionIdsTruncated: false,
    })

    expect(callOrder).toEqual(["list-sessions", "reset-sessions", "analyze", "analyze", "wait-observations", "garden"])
  })

  it("propagates workflow cancellation", async () => {
    const cancellation = new Error("cancelled")
    cancellation.name = "CancelledFailure"
    childErrors["session-1"] = cancellation

    parentCancellationState.consideredCancelled = true

    await expect(backfillRecentSessionIntelligenceWorkflow(input)).rejects.toThrow("cancelled")
    expect(callOrder).toEqual(["list-sessions", "reset-sessions", "analyze"])
  })
})
