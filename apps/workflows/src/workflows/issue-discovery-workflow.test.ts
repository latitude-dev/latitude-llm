import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities, mockSleep } = vi.hoisted(() => {
  const callOrder: string[] = []
  type MockRetrievalResult = {
    matchedIssueUuid: string | null
    similarityScore: number
  }
  type MockEligibilityResult =
    | {
        status: "eligible"
      }
    | {
        status: "skipped"
        reason: "PassedScoreNotEligibleForDiscoveryError"
      }
  type MockResolvedIssueMatch = {
    issueId: string | null
  }
  type MockAssignmentResult = {
    action: "created" | "assigned-existing" | "already-assigned"
    issueId: string
  }
  type MockFinalizeResult =
    | {
        status: "finalized"
        assignment: MockAssignmentResult
      }
    | {
        status: "lock-unavailable"
      }

  const mockActivities = {
    checkEligibility: vi.fn<() => Promise<MockEligibilityResult>>(async () => {
      callOrder.push("checkEligibility")
      return {
        status: "eligible" as const,
      }
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
    rerankIssueCandidates: vi.fn<() => Promise<MockRetrievalResult>>(async () => {
      callOrder.push("rerankIssueCandidates")
      return {
        matchedIssueUuid: "issue-1",
        similarityScore: 0.91,
      }
    }),
    resolveMatchedIssue: vi.fn<() => Promise<MockResolvedIssueMatch>>(async () => {
      callOrder.push("resolveMatchedIssue")
      return {
        issueId: "issue-1",
      }
    }),
    finalizeIssueDiscovery: vi.fn<() => Promise<MockFinalizeResult>>(async () => {
      callOrder.push("finalizeIssueDiscovery")
      return {
        status: "finalized" as const,
        assignment: {
          action: "created",
          issueId: "issue-new",
        },
      }
    }),
    assignScoreToIssue: vi.fn<() => Promise<MockAssignmentResult>>(async () => {
      callOrder.push("assignScoreToIssue")
      return {
        action: "assigned-existing",
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

  const mockSleep = vi.fn(async (durationMs: number) => {
    callOrder.push(`sleep:${durationMs}`)
  })

  return {
    callOrder,
    mockActivities,
    mockSleep,
  }
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
      "resolveMatchedIssue",
      "assignScoreToIssue",
      "syncIssueProjections",
      "syncScoreAnalytics",
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
    expect(mockActivities.resolveMatchedIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      matchedIssueUuid: "issue-1",
    })
    expect(mockActivities.assignScoreToIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      issueId: "issue-1",
      normalizedEmbedding: [0.6, 0.8],
    })
    expect(mockActivities.finalizeIssueDiscovery).not.toHaveBeenCalled()
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
    expect(mockActivities.hybridSearchIssues).not.toHaveBeenCalled()
    expect(mockActivities.rerankIssueCandidates).not.toHaveBeenCalled()
    expect(mockActivities.resolveMatchedIssue).not.toHaveBeenCalled()
    expect(mockActivities.finalizeIssueDiscovery).not.toHaveBeenCalled()
    expect(mockActivities.assignScoreToIssue).not.toHaveBeenCalled()
    expect(mockActivities.syncScoreAnalytics).not.toHaveBeenCalled()
    expect(mockActivities.syncIssueProjections).not.toHaveBeenCalled()
  })

  it("creates a brand-new issue after resolving to no canonical match", async () => {
    mockActivities.rerankIssueCandidates.mockImplementationOnce(async () => {
      callOrder.push("rerankIssueCandidates")
      return {
        matchedIssueUuid: null,
        similarityScore: 0,
      }
    })
    mockActivities.resolveMatchedIssue.mockImplementationOnce(async () => {
      callOrder.push("resolveMatchedIssue")
      return {
        issueId: null,
      }
    })
    mockActivities.finalizeIssueDiscovery.mockImplementationOnce(async () => {
      callOrder.push("finalizeIssueDiscovery")
      return {
        status: "finalized" as const,
        assignment: {
          action: "created",
          issueId: "issue-new",
        },
      }
    })

    const result = await issueDiscoveryWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })

    expect(result).toEqual({
      action: "created",
      issueId: "issue-new",
    })
    expect(callOrder).toEqual([
      "checkEligibility",
      "embedScoreFeedback",
      "hybridSearchIssues",
      "rerankIssueCandidates",
      "resolveMatchedIssue",
      "finalizeIssueDiscovery",
      "syncScoreAnalytics",
    ])
    expect(mockActivities.syncIssueProjections).not.toHaveBeenCalled()
    expect(mockActivities.resolveMatchedIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      matchedIssueUuid: null,
    })
    expect(mockActivities.finalizeIssueDiscovery).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      feedback: "token leakage in tool output",
      normalizedEmbedding: [0.6, 0.8],
    })
    expect(mockActivities.assignScoreToIssue).not.toHaveBeenCalled()
  })

  it("falls back to create flow when the reranked candidate is stale in Postgres", async () => {
    mockActivities.resolveMatchedIssue.mockImplementationOnce(async () => {
      callOrder.push("resolveMatchedIssue")
      return {
        issueId: null,
      }
    })
    mockActivities.finalizeIssueDiscovery.mockImplementationOnce(async () => {
      callOrder.push("finalizeIssueDiscovery")
      return {
        status: "finalized" as const,
        assignment: {
          action: "created",
          issueId: "issue-new",
        },
      }
    })

    const result = await issueDiscoveryWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })

    expect(result).toEqual({
      action: "created",
      issueId: "issue-new",
    })
    expect(callOrder).toEqual([
      "checkEligibility",
      "embedScoreFeedback",
      "hybridSearchIssues",
      "rerankIssueCandidates",
      "resolveMatchedIssue",
      "finalizeIssueDiscovery",
      "syncScoreAnalytics",
    ])
    expect(mockActivities.syncIssueProjections).not.toHaveBeenCalled()
    expect(mockActivities.resolveMatchedIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      matchedIssueUuid: "issue-1",
    })
    expect(mockActivities.finalizeIssueDiscovery).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      feedback: "token leakage in tool output",
      normalizedEmbedding: [0.6, 0.8],
    })
    expect(mockActivities.assignScoreToIssue).not.toHaveBeenCalled()
  })

  it("retries finalization lock contention with workflow sleeps", async () => {
    mockActivities.resolveMatchedIssue.mockImplementationOnce(async () => {
      callOrder.push("resolveMatchedIssue")
      return {
        issueId: null,
      }
    })
    mockActivities.finalizeIssueDiscovery
      .mockImplementationOnce(async () => {
        callOrder.push("finalizeIssueDiscovery")
        return { status: "lock-unavailable" as const }
      })
      .mockImplementationOnce(async () => {
        callOrder.push("finalizeIssueDiscovery")
        return { status: "lock-unavailable" as const }
      })
      .mockImplementationOnce(async () => {
        callOrder.push("finalizeIssueDiscovery")
        return {
          status: "finalized" as const,
          assignment: {
            action: "assigned-existing" as const,
            issueId: "issue-1",
          },
        }
      })

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
      "resolveMatchedIssue",
      "finalizeIssueDiscovery",
      "sleep:1000",
      "finalizeIssueDiscovery",
      "sleep:2000",
      "finalizeIssueDiscovery",
      "syncScoreAnalytics",
    ])
    expect(mockActivities.syncIssueProjections).not.toHaveBeenCalled()
    expect(mockSleep).toHaveBeenCalledTimes(2)
  })
})
