import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  callOrder,
  childDelays,
  childErrors,
  childExecutions,
  childResults,
  mockActivities,
  mockWorkflowLog,
  parentCancellationState,
  patchedState,
} = vi.hoisted(() => {
  const callOrder: string[] = []
  const childDelays: Record<string, () => Promise<void>> = {}
  const childErrors: Record<string, Error> = {}
  const childResults: Record<string, unknown> = {}
  const mockWorkflowLog = { warn: vi.fn() }
  const parentCancellationState = { consideredCancelled: false }
  const patchedState: { default: boolean; readonly byId: Record<string, boolean> } = { default: true, byId: {} }
  const childExecutions: Array<{ readonly args: unknown[]; readonly workflowId: string }> = []
  const mockActivities = {
    resetSessionIntelligenceForProjectActivity: vi.fn(async () => {
      callOrder.push("reset-session-intelligence")
    }),
    resetTaxonomyForProjectActivity: vi.fn(async () => {
      callOrder.push("reset-taxonomy")
    }),
    listBackfillSessionsActivity: vi.fn(async () => {
      callOrder.push("list-sessions")
      return [
        {
          sessionId: "session-1",
          triggeringTraceId: "trace-1",
          triggeringStartTime: "2026-01-01T00:00:00.000Z",
        },
        {
          sessionId: "session-2",
          triggeringTraceId: "trace-2",
          triggeringStartTime: "2026-01-01T00:01:00.000Z",
        },
      ]
    }),
    waitForTaxonomyObservationStabilityActivity: vi.fn(async () => {
      callOrder.push("wait-observations")
    }),
  }
  return {
    callOrder,
    childDelays,
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
    childExecutions.push({ args: options.args, workflowId: options.workflowId })
    const sessionId = (options.args[0] as { readonly sessionId?: string }).sessionId
    if (sessionId) {
      await childDelays[sessionId]?.()
      if (childErrors[sessionId]) throw childErrors[sessionId]
      return childResults[sessionId] ?? childResults["*"] ?? { action: "recorded", status: "analyzed", momentCount: 0 }
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

import { backfillSessionIntelligenceWorkflow } from "./session-intelligence-backfill-workflow.ts"

const input = {
  organizationId: "org-1",
  projectId: "project-1",
  sessionLimit: 1500,
  reason: "backoffice" as const,
}

describe("backfillSessionIntelligenceWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    childExecutions.length = 0
    for (const sessionId of Object.keys(childDelays)) delete childDelays[sessionId]
    for (const sessionId of Object.keys(childErrors)) delete childErrors[sessionId]
    for (const sessionId of Object.keys(childResults)) delete childResults[sessionId]
    parentCancellationState.consideredCancelled = false
    patchedState.default = true
    for (const id of Object.keys(patchedState.byId)) delete patchedState.byId[id]
    vi.clearAllMocks()
  })

  it("uses distinct child workflow ids for backoffice session analysis", async () => {
    const result = await backfillSessionIntelligenceWorkflow(input)

    expect(result).toEqual({
      action: "completed",
      sessionsFound: 2,
      sessionsCompleted: 2,
      sessionsFailed: 0,
      failedSessionIds: [],
      failedSessionIdsTruncated: false,
    })
    expect(childExecutions).toEqual([
      {
        args: [
          {
            organizationId: "org-1",
            projectId: "project-1",
            sessionId: "session-1",
            triggeringTraceId: "trace-1",
            triggeringStartTime: "2026-01-01T00:00:00.000Z",
            reason: "backfill",
          },
        ],
        workflowId: "org:org-1:conversation-intelligence:backfillAnalyzeSession:project-1:session-1",
      },
      {
        args: [
          {
            organizationId: "org-1",
            projectId: "project-1",
            sessionId: "session-2",
            triggeringTraceId: "trace-2",
            triggeringStartTime: "2026-01-01T00:01:00.000Z",
            reason: "backfill",
          },
        ],
        workflowId: "org:org-1:conversation-intelligence:backfillAnalyzeSession:project-1:session-2",
      },
      {
        args: [{ organizationId: "org-1", projectId: "project-1", dimension: "topic", trigger: "manual" }],
        workflowId: "org:org-1:taxonomy:garden:project-1:backfill",
      },
    ])
  })

  it("continues after child failures and still gardens with mixed patch markers", async () => {
    patchedState.byId["session-intelligence-backfill-child-concurrency-10-v1"] = false
    childErrors["session-1"] = new Error("analysis failed")

    await expect(backfillSessionIntelligenceWorkflow(input)).resolves.toEqual({
      action: "completed",
      sessionsFound: 2,
      sessionsCompleted: 1,
      sessionsFailed: 1,
      failedSessionIds: ["session-1"],
      failedSessionIdsTruncated: false,
    })

    expect(childExecutions.map(({ workflowId }) => workflowId)).toContain(
      "org:org-1:taxonomy:garden:project-1:backfill",
    )
  })

  it("counts resolved failed analysis statuses and logs the status", async () => {
    childResults["session-1"] = { action: "recorded", status: "failed", momentCount: 0 }

    await expect(backfillSessionIntelligenceWorkflow(input)).resolves.toMatchObject({
      sessionsFound: 2,
      sessionsCompleted: 1,
      sessionsFailed: 1,
      failedSessionIds: ["session-1"],
      failedSessionIdsTruncated: false,
    })
    expect(mockWorkflowLog.warn).toHaveBeenCalledWith("Session analysis child resolved as failed", {
      organizationId: "org-1",
      projectId: "project-1",
      sessionId: "session-1",
      status: "failed",
    })
  })

  it("counts skipped analyses as completed", async () => {
    childResults["session-1"] = { action: "skipped", reason: "hash-current" }

    await expect(backfillSessionIntelligenceWorkflow(input)).resolves.toMatchObject({
      sessionsFound: 2,
      sessionsCompleted: 2,
      sessionsFailed: 0,
      failedSessionIds: [],
      failedSessionIdsTruncated: false,
    })
  })

  it("records independently cancelled children and rethrows parent cancellation", async () => {
    const cancellation = new Error("child cancelled")
    cancellation.name = "CancelledFailure"
    childErrors["session-1"] = cancellation

    await expect(backfillSessionIntelligenceWorkflow(input)).resolves.toMatchObject({
      sessionsCompleted: 1,
      sessionsFailed: 1,
      failedSessionIds: ["session-1"],
    })
    expect(mockWorkflowLog.warn).toHaveBeenCalledWith("Session analysis child execution failed", {
      organizationId: "org-1",
      projectId: "project-1",
      sessionId: "session-1",
      reason: "child cancelled",
    })

    parentCancellationState.consideredCancelled = true
    await expect(backfillSessionIntelligenceWorkflow(input)).rejects.toThrow("child cancelled")
  })

  it("keeps failed-session samples in input order and caps them", async () => {
    mockActivities.listBackfillSessionsActivity.mockResolvedValueOnce(
      Array.from({ length: 101 }, (_, index) => ({
        sessionId: `session-${index + 1}`,
        triggeringTraceId: `trace-${index + 1}`,
        triggeringStartTime: "2026-01-01T00:00:00.000Z",
      })),
    )
    childResults["*"] = { action: "recorded", status: "failed", momentCount: 0 }
    childDelays["session-1"] = async () => {
      await Promise.resolve()
    }

    await expect(backfillSessionIntelligenceWorkflow(input)).resolves.toMatchObject({
      sessionsFound: 101,
      sessionsCompleted: 0,
      sessionsFailed: 101,
      failedSessionIds: Array.from({ length: 100 }, (_, index) => `session-${index + 1}`),
      failedSessionIdsTruncated: true,
    })
  })

  it("classifies resolved analysis failures for legacy histories", async () => {
    patchedState.byId["session-intelligence-backfill-continue-child-failures-v1"] = false
    childResults["session-1"] = { action: "recorded", status: "failed", momentCount: 0 }

    await expect(backfillSessionIntelligenceWorkflow(input)).resolves.toMatchObject({
      sessionsFound: 2,
      sessionsCompleted: 1,
      sessionsFailed: 1,
      failedSessionIds: ["session-1"],
    })
  })

  it("preserves rejected child failures for legacy histories", async () => {
    patchedState.default = false
    childErrors["session-1"] = new Error("analysis failed")

    await expect(backfillSessionIntelligenceWorkflow(input)).rejects.toThrow("analysis failed")
    expect(childExecutions.map(({ workflowId }) => workflowId)).not.toContain(
      "org:org-1:taxonomy:garden:project-1:backfill",
    )
  })
})
