import { beforeEach, describe, expect, it, vi } from "vitest"

const { childExecutions, mockActivities } = vi.hoisted(() => {
  const childExecutions: Array<{ readonly args: unknown[]; readonly workflowId: string }> = []
  const mockActivities = {
    listSessionIntelligenceBackfillProjectsActivity: vi.fn(async () => [
      { organizationId: "org-1", projectId: "project-1" },
      { organizationId: "org-2", projectId: "project-2" },
    ]),
  }
  return { childExecutions, mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
  executeChild: async (_workflow: unknown, options: { args: unknown[]; workflowId: string }) => {
    childExecutions.push({ args: options.args, workflowId: options.workflowId })
    return {
      action: "completed",
      sessionsFound: options.workflowId.includes("project-1") ? 2 : 3,
    }
  },
}))

vi.mock("./recent-session-intelligence-backfill-workflow.ts", () => ({
  backfillRecentSessionIntelligenceWorkflow: async () => ({ action: "completed", sessionsFound: 0 }),
}))

import { backfillRecentSessionIntelligenceForProjectsWorkflow } from "./recent-session-intelligence-projects-backfill-workflow.ts"

describe("backfillRecentSessionIntelligenceForProjectsWorkflow", () => {
  beforeEach(() => {
    childExecutions.length = 0
    vi.clearAllMocks()
  })

  it("starts one recent backfill child per project with bounded project inputs", async () => {
    const result = await backfillRecentSessionIntelligenceForProjectsWorkflow({
      sessionLimitPerProject: 500,
      startedAfter: "2026-06-07T00:00:00.000Z",
      projectConcurrency: 1,
      sessionConcurrencyPerProject: 4,
      gardenAfter: true,
    })

    expect(result).toEqual({ action: "completed", projectsFound: 2, sessionsFound: 5 })
    expect(mockActivities.listSessionIntelligenceBackfillProjectsActivity).toHaveBeenCalledWith({})
    expect(childExecutions).toEqual([
      {
        args: [
          {
            organizationId: "org-1",
            projectId: "project-1",
            sessionLimit: 500,
            startedAfter: "2026-06-07T00:00:00.000Z",
            sessionConcurrency: 4,
            gardenAfter: true,
          },
        ],
        workflowId: "org:org-1:conversation-intelligence:recentBackfill:project-1:2026-06-07T00:00:00.000Z",
      },
      {
        args: [
          {
            organizationId: "org-2",
            projectId: "project-2",
            sessionLimit: 500,
            startedAfter: "2026-06-07T00:00:00.000Z",
            sessionConcurrency: 4,
            gardenAfter: true,
          },
        ],
        workflowId: "org:org-2:conversation-intelligence:recentBackfill:project-2:2026-06-07T00:00:00.000Z",
      },
    ])
  })
})
