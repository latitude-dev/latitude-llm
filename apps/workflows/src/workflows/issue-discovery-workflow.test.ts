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
    action: "created" | "assigned" | "already-assigned"
    issueId: string
  }
  type MockSerializeResult =
    | {
        status: "serialized"
        assignment: MockAssignmentResult
      }
    | {
        status: "lock-unavailable"
      }
    | {
        status: "skipped"
        reason: string
      }
  type MockAssignResult =
    | {
        status: "assigned"
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
    serializeIssueDiscovery: vi.fn<() => Promise<MockSerializeResult>>(async () => {
      callOrder.push("serializeIssueDiscovery")
      return {
        status: "serialized" as const,
        assignment: {
          action: "created",
          issueId: "issue-new",
        },
      }
    }),
    assignScoreToIssue: vi.fn<() => Promise<MockAssignResult>>(async () => {
      callOrder.push("assignScoreToIssue")
      return {
        status: "assigned" as const,
        assignment: {
          action: "assigned",
          issueId: "issue-1",
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
      action: "assigned",
      issueId: "issue-1",
    })

    expect(callOrder).toEqual([
      "checkEligibility",
      "embedScoreFeedback",
      "hybridSearchIssues",
      "rerankIssueCandidates",
      "resolveMatchedIssue",
      "assignScoreToIssue",
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
    expect(mockActivities.serializeIssueDiscovery).not.toHaveBeenCalled()
    expect(mockActivities.syncScoreAnalytics).toHaveBeenCalledWith({
      organizationId: "org-1",
      scoreId: "score-1",
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
    expect(mockActivities.serializeIssueDiscovery).not.toHaveBeenCalled()
    expect(mockActivities.assignScoreToIssue).not.toHaveBeenCalled()
    expect(mockActivities.syncScoreAnalytics).not.toHaveBeenCalled()
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
    mockActivities.serializeIssueDiscovery.mockImplementationOnce(async () => {
      callOrder.push("serializeIssueDiscovery")
      return {
        status: "serialized" as const,
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
      "serializeIssueDiscovery",
      "syncScoreAnalytics",
    ])
    expect(mockActivities.resolveMatchedIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      matchedIssueUuid: null,
    })
    expect(mockActivities.serializeIssueDiscovery).toHaveBeenCalledWith({
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
    mockActivities.serializeIssueDiscovery.mockImplementationOnce(async () => {
      callOrder.push("serializeIssueDiscovery")
      return {
        status: "serialized" as const,
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
      "serializeIssueDiscovery",
      "syncScoreAnalytics",
    ])
    expect(mockActivities.resolveMatchedIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      matchedIssueUuid: "issue-1",
    })
    expect(mockActivities.serializeIssueDiscovery).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      feedback: "token leakage in tool output",
      normalizedEmbedding: [0.6, 0.8],
    })
    expect(mockActivities.assignScoreToIssue).not.toHaveBeenCalled()
  })

  it("retries serialization lock contention with workflow sleeps", async () => {
    // Pin Math.random so the jitter component of the retry delay is at its minimum (1s) and the asserted
    // sleep durations stay deterministic. Math.random() is replay-safe inside Temporal workflows.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)
    try {
      mockActivities.resolveMatchedIssue.mockImplementationOnce(async () => {
        callOrder.push("resolveMatchedIssue")
        return {
          issueId: null,
        }
      })
      mockActivities.serializeIssueDiscovery
        .mockImplementationOnce(async () => {
          callOrder.push("serializeIssueDiscovery")
          return { status: "lock-unavailable" as const }
        })
        .mockImplementationOnce(async () => {
          callOrder.push("serializeIssueDiscovery")
          return { status: "lock-unavailable" as const }
        })
        .mockImplementationOnce(async () => {
          callOrder.push("serializeIssueDiscovery")
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

      expect(result).toEqual({
        action: "assigned",
        issueId: "issue-1",
      })
      expect(callOrder).toEqual([
        "checkEligibility",
        "embedScoreFeedback",
        "hybridSearchIssues",
        "rerankIssueCandidates",
        "resolveMatchedIssue",
        "serializeIssueDiscovery",
        "sleep:2000",
        "serializeIssueDiscovery",
        "sleep:3000",
        "serializeIssueDiscovery",
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
      mockActivities.resolveMatchedIssue.mockImplementationOnce(async () => {
        callOrder.push("resolveMatchedIssue")
        return { issueId: null }
      })
      mockActivities.serializeIssueDiscovery.mockImplementation(async () => {
        callOrder.push("serializeIssueDiscovery")
        return { status: "lock-unavailable" as const }
      })

      await expect(
        issueDiscoveryWorkflow({
          organizationId: "org-1",
          projectId: "proj-1",
          scoreId: "score-1",
        }),
      ).rejects.toThrow(/Lock remained unavailable after 18 workflow retries/)

      // 18 attempts, 17 sleeps in between (no sleep after the final attempt).
      expect(mockActivities.serializeIssueDiscovery).toHaveBeenCalledTimes(18)
      expect(mockSleep).toHaveBeenCalledTimes(17)
      expect(mockActivities.syncScoreAnalytics).not.toHaveBeenCalled()
    } finally {
      randomSpy.mockRestore()
    }
  })
})
