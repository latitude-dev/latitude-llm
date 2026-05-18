import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities, mockSleep } = vi.hoisted(() => {
  const callOrder: string[] = []
  type MockEligibilityResult =
    | { readonly status: "eligible" }
    | { readonly status: "skipped"; readonly reason: "PassedScoreNotEligibleForDiscoveryError" }
  type MockAssignmentResult = {
    readonly action: "created" | "assigned" | "already-assigned"
    readonly issueId: string
  }
  type MockAssignOrCreateResult =
    | { readonly status: "serialized"; readonly assignment: MockAssignmentResult }
    | { readonly status: "lock-unavailable" }
    | { readonly status: "skipped"; readonly reason: string }

  const mockActivities = {
    checkEligibility: vi.fn<() => Promise<MockEligibilityResult>>(async () => {
      callOrder.push("checkEligibility")
      return { status: "eligible" as const }
    }),
    embedScoreFeedback: vi.fn(async () => {
      callOrder.push("embedScoreFeedback")
      return {
        scoreId: "score-1",
        feedback: "token leakage in tool output",
        normalizedEmbedding: [0.6, 0.8],
      }
    }),
    assignOrCreateIssue: vi.fn<() => Promise<MockAssignOrCreateResult>>(async () => {
      callOrder.push("assignOrCreateIssue")
      return {
        status: "serialized" as const,
        assignment: {
          action: "created" as const,
          issueId: "issue-new",
        },
      }
    }),
    syncScoreAnalytics: vi.fn(async () => {
      callOrder.push("syncScoreAnalytics")
    }),
  }

  const mockSleep = vi.fn(async (durationMs: number) => {
    callOrder.push(`sleep:${durationMs}`)
  })

  return { callOrder, mockActivities, mockSleep }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
  sleep: mockSleep,
}))

import { issueDiscoveryWorkflow } from "./issue-discovery-workflow.ts"

describe("issueDiscoveryWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
  })

  it("embeds feedback, assigns or creates an issue, and syncs analytics", async () => {
    mockActivities.assignOrCreateIssue.mockImplementationOnce(async () => {
      callOrder.push("assignOrCreateIssue")
      return {
        status: "serialized" as const,
        assignment: {
          action: "assigned" as const,
          issueId: "issue-1",
        },
      }
    })

    const result = await issueDiscoveryWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })

    expect(result).toEqual({ action: "assigned", issueId: "issue-1" })
    expect(callOrder).toEqual(["checkEligibility", "embedScoreFeedback", "assignOrCreateIssue", "syncScoreAnalytics"])
    expect(mockActivities.assignOrCreateIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      feedback: "token leakage in tool output",
      normalizedEmbedding: [0.6, 0.8],
    })
    expect(mockActivities.syncScoreAnalytics).toHaveBeenCalledWith({
      organizationId: "org-1",
      scoreId: "score-1",
    })
  })

  it("skips embedding and assignment for known eligibility errors", async () => {
    mockActivities.checkEligibility.mockResolvedValueOnce({
      status: "skipped" as const,
      reason: "PassedScoreNotEligibleForDiscoveryError" as const,
    })

    const result = await issueDiscoveryWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })

    expect(result).toEqual({
      action: "skipped",
      reason: "PassedScoreNotEligibleForDiscoveryError",
    })
    expect(mockActivities.embedScoreFeedback).not.toHaveBeenCalled()
    expect(mockActivities.assignOrCreateIssue).not.toHaveBeenCalled()
    expect(mockActivities.syncScoreAnalytics).not.toHaveBeenCalled()
  })

  it("returns skipped assignment results without syncing analytics", async () => {
    mockActivities.assignOrCreateIssue.mockImplementationOnce(async () => {
      callOrder.push("assignOrCreateIssue")
      return { status: "skipped" as const, reason: "ScoreNotFoundForDiscoveryError" }
    })

    const result = await issueDiscoveryWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })

    expect(result).toEqual({ action: "skipped", reason: "ScoreNotFoundForDiscoveryError" })
    expect(mockActivities.syncScoreAnalytics).not.toHaveBeenCalled()
  })

  it("retries assignment lock contention with workflow sleeps", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)
    try {
      mockActivities.assignOrCreateIssue
        .mockImplementationOnce(async () => {
          callOrder.push("assignOrCreateIssue")
          return { status: "lock-unavailable" as const }
        })
        .mockImplementationOnce(async () => {
          callOrder.push("assignOrCreateIssue")
          return { status: "lock-unavailable" as const }
        })
        .mockImplementationOnce(async () => {
          callOrder.push("assignOrCreateIssue")
          return {
            status: "serialized" as const,
            assignment: {
              action: "assigned" as const,
              issueId: "issue-1",
            },
          }
        })

      const result = await issueDiscoveryWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        scoreId: "score-1",
      })

      expect(result).toEqual({ action: "assigned", issueId: "issue-1" })
      expect(callOrder).toEqual([
        "checkEligibility",
        "embedScoreFeedback",
        "assignOrCreateIssue",
        "sleep:2000",
        "assignOrCreateIssue",
        "sleep:3000",
        "assignOrCreateIssue",
        "syncScoreAnalytics",
      ])
      expect(mockSleep).toHaveBeenCalledTimes(2)
    } finally {
      randomSpy.mockRestore()
    }
  })

  it("fails the workflow after exhausting lock-retry attempts", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)
    try {
      mockActivities.assignOrCreateIssue.mockImplementation(async () => {
        callOrder.push("assignOrCreateIssue")
        return { status: "lock-unavailable" as const }
      })

      await expect(
        issueDiscoveryWorkflow({
          organizationId: "org-1",
          projectId: "proj-1",
          scoreId: "score-1",
        }),
      ).rejects.toThrow(/Lock remained unavailable after 18 workflow retries/)

      expect(mockActivities.assignOrCreateIssue).toHaveBeenCalledTimes(18)
      expect(mockSleep).toHaveBeenCalledTimes(17)
      expect(mockActivities.syncScoreAnalytics).not.toHaveBeenCalled()
    } finally {
      randomSpy.mockRestore()
    }
  })
})
