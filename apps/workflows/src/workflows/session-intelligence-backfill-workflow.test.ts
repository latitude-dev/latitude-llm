import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, childExecutions, mockActivities, patchedState } = vi.hoisted(() => {
  const callOrder: string[] = []
  const patchedState = { enabled: true }
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
  return { callOrder, childExecutions, mockActivities, patchedState }
})

vi.mock("@temporalio/workflow", () => ({
  patched: () => patchedState.enabled,
  proxyActivities: () => mockActivities,
  executeChild: async (_workflow: unknown, options: { args: unknown[]; workflowId: string }) => {
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
    patchedState.enabled = true
    vi.clearAllMocks()
  })

  it("uses distinct child workflow ids for backoffice session analysis", async () => {
    const result = await backfillSessionIntelligenceWorkflow(input)

    expect(result).toEqual({ action: "completed", sessionsFound: 2 })
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
})
