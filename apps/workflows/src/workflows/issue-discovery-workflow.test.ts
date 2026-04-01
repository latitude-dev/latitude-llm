import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities } = vi.hoisted(() => {
  const callOrder: string[] = []

  const mockActivities = {
    checkEligibility: vi.fn(async () => {
      callOrder.push("checkEligibility")
      return true as const
    }),
    embedScoreFeedback: vi.fn(async () => {
      callOrder.push("embedScoreFeedback")
      return {
        scoreId: "score-1",
        feedback: "token leakage in tool output",
        normalizedEmbedding: [0.6, 0.8],
      }
    }),
    hybridSearchIssues: vi.fn(async () => {
      callOrder.push("hybridSearchIssues")
      return {
        candidates: [{ uuid: "issue-1", title: "Token leakage", description: "tokens exposed", score: 0.9 }],
      }
    }),
    rerankIssueCandidates: vi.fn(async () => {
      callOrder.push("rerankIssueCandidates")
      return {
        matchedIssueId: "issue-1",
        similarityScore: 0.91,
      }
    }),
    createOrAssignIssue: vi.fn(async () => {
      callOrder.push("createOrAssignIssue")
      return {
        action: "assigned-existing" as const,
        issueId: "issue-1",
      }
    }),
    syncScoreAnalytics: vi.fn(async () => {
      callOrder.push("syncScoreAnalytics")
    }),
    syncIssueProjections: vi.fn(async () => {
      callOrder.push("syncIssueProjections")
    }),
  }

  return {
    callOrder,
    mockActivities,
  }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
}))

import { issueDiscoveryWorkflow } from "./issue-discovery-workflow.ts"

describe("issueDiscoveryWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
  })

  it("runs retrieval in order: embed -> hybrid -> rerank", async () => {
    const result = await issueDiscoveryWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })

    expect(result).toEqual({
      action: "assigned-existing",
      issueId: "issue-1",
    })

    expect(callOrder).toEqual([
      "checkEligibility",
      "embedScoreFeedback",
      "hybridSearchIssues",
      "rerankIssueCandidates",
      "createOrAssignIssue",
      "syncScoreAnalytics",
      "syncIssueProjections",
    ])

    expect(mockActivities.hybridSearchIssues).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      query: "token leakage in tool output",
      normalizedEmbedding: [0.6, 0.8],
    })
    expect(mockActivities.rerankIssueCandidates).toHaveBeenCalledWith({
      query: "token leakage in tool output",
      candidates: [{ uuid: "issue-1", title: "Token leakage", description: "tokens exposed", score: 0.9 }],
    })
    expect(mockActivities.createOrAssignIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      matchedIssueId: "issue-1",
      normalizedEmbedding: [0.6, 0.8],
    })
    expect(mockActivities.syncScoreAnalytics).toHaveBeenCalledWith({
      organizationId: "org-1",
      scoreId: "score-1",
    })
    expect(mockActivities.syncIssueProjections).toHaveBeenCalledWith({
      organizationId: "org-1",
      issueId: "issue-1",
    })
  })

  it("skips retrieval stages for known eligibility errors", async () => {
    mockActivities.checkEligibility.mockRejectedValueOnce({
      _tag: "PassedScoreNotEligibleForDiscoveryError",
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
    expect(mockActivities.hybridSearchIssues).not.toHaveBeenCalled()
    expect(mockActivities.rerankIssueCandidates).not.toHaveBeenCalled()
    expect(mockActivities.createOrAssignIssue).not.toHaveBeenCalled()
    expect(mockActivities.syncScoreAnalytics).not.toHaveBeenCalled()
    expect(mockActivities.syncIssueProjections).not.toHaveBeenCalled()
  })
})
