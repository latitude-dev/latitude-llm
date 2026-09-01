import { beforeEach, describe, expect, it, vi } from "vitest"

const { childExecutions, childResults, mockActivities } = vi.hoisted(() => {
  const childExecutions: Array<{ readonly args: unknown[]; readonly workflowId: string }> = []
  const childResults: Record<string, unknown> = {}
  const mockActivities = {
    listSessionIntelligenceBackfillProjectsActivity: vi.fn(async () => [
      { organizationId: "org-1", projectId: "project-1" },
      { organizationId: "org-2", projectId: "project-2" },
    ]),
  }
  return { childExecutions, childResults, mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
  executeChild: async (_workflow: unknown, options: { args: unknown[]; workflowId: string }) => {
    childExecutions.push({ args: options.args, workflowId: options.workflowId })
    const projectId = (options.args[0] as { readonly projectId: string }).projectId
    return (
      childResults[projectId] ??
      (projectId === "project-1"
        ? {
            action: "completed",
            sessionsFound: 2,
            sessionsCompleted: 1,
            sessionsFailed: 1,
            failedSessionIds: ["session-1"],
            failedSessionIdsTruncated: false,
          }
        : {
            action: "completed",
            sessionsFound: 3,
            sessionsCompleted: 3,
            sessionsFailed: 0,
            failedSessionIds: [],
            failedSessionIdsTruncated: false,
          })
    )
  },
}))

vi.mock("./recent-session-intelligence-backfill-workflow.ts", () => ({
  backfillRecentSessionIntelligenceWorkflow: async () => ({ action: "completed", sessionsFound: 0 }),
}))

import { backfillRecentSessionIntelligenceForProjectsWorkflow } from "./recent-session-intelligence-projects-backfill-workflow.ts"

describe("backfillRecentSessionIntelligenceForProjectsWorkflow", () => {
  beforeEach(() => {
    childExecutions.length = 0
    for (const projectId of Object.keys(childResults)) delete childResults[projectId]
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

    expect(result).toEqual({
      action: "completed",
      projectsFound: 2,
      sessionsFound: 5,
      sessionsCompleted: 4,
      sessionsFailed: 1,
      failedSessionIds: ["session-1"],
      failedSessionIdsTruncated: false,
    })
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

  it("caps child failure-id samples while preserving exact counts and legacy child results", async () => {
    childResults["project-1"] = {
      action: "completed",
      sessionsFound: 101,
      sessionsCompleted: 0,
      sessionsFailed: 101,
      failedSessionIds: Array.from({ length: 101 }, (_, index) => `session-${index + 1}`),
      failedSessionIdsTruncated: true,
    }
    childResults["project-2"] = { action: "completed", sessionsFound: 3 }

    await expect(
      backfillRecentSessionIntelligenceForProjectsWorkflow({
        sessionLimitPerProject: 500,
        startedAfter: "2026-06-07T00:00:00.000Z",
        projectConcurrency: 1,
      }),
    ).resolves.toMatchObject({
      projectsFound: 2,
      sessionsFound: 104,
      sessionsCompleted: 3,
      sessionsFailed: 101,
      failedSessionIds: Array.from({ length: 100 }, (_, index) => `session-${index + 1}`),
      failedSessionIdsTruncated: true,
    })
  })
})
