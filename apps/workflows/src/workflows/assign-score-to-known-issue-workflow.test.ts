import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities } = vi.hoisted(() => {
  const callOrder: string[] = []
  type MockAssignmentResult = {
    action: "assigned-existing" | "already-assigned" | "created"
    issueId: string
  }

  const mockActivities = {
    embedScoreFeedback: vi.fn(async () => {
      callOrder.push("embedScoreFeedback")
      return {
        scoreId: "score-1",
        feedback: "token leakage",
        normalizedEmbedding: [0.6, 0.8],
      }
    }),
    assignScoreToIssue: vi.fn(async (): Promise<MockAssignmentResult> => {
      callOrder.push("assignScoreToIssue")
      return {
        action: "assigned-existing",
        issueId: "issue-known",
      }
    }),
    syncIssueProjections: vi.fn(async () => {
      callOrder.push("syncIssueProjections")
    }),
    syncScoreAnalytics: vi.fn(async () => {
      callOrder.push("syncScoreAnalytics")
    }),
  }

  return { callOrder, mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
}))

import { assignScoreToKnownIssueWorkflow } from "./assign-score-to-known-issue-workflow.ts"

describe("assignScoreToKnownIssueWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
  })

  it("runs embed, assign, and sync activities in order", async () => {
    const result = await assignScoreToKnownIssueWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      issueId: "issue-known",
    })

    expect(result).toEqual({
      action: "assigned-existing",
      issueId: "issue-known",
    })

    expect(callOrder).toEqual([
      "embedScoreFeedback",
      "assignScoreToIssue",
      "syncIssueProjections",
      "syncScoreAnalytics",
    ])

    expect(mockActivities.embedScoreFeedback).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })
    expect(mockActivities.assignScoreToIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      issueId: "issue-known",
      normalizedEmbedding: [0.6, 0.8],
    })
    expect(mockActivities.syncIssueProjections).toHaveBeenCalledWith({
      organizationId: "org-1",
      issueId: "issue-known",
    })
    expect(mockActivities.syncScoreAnalytics).toHaveBeenCalledWith({
      organizationId: "org-1",
      scoreId: "score-1",
    })
  })
})
