import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities, mockSleep } = vi.hoisted(() => {
  const callOrder: string[] = []
  type MockAssignmentResult = {
    action: "assigned" | "already-assigned" | "created"
    signalId: string
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
    embedScoreFeedback: vi.fn(async () => {
      callOrder.push("embedScoreFeedback")
      return {
        scoreId: "score-1",
        feedback: "token leakage",
        normalizedEmbedding: [0.6, 0.8],
      }
    }),
    assignScoreToSignal: vi.fn(async (): Promise<MockAssignResult> => {
      callOrder.push("assignScoreToSignal")
      return {
        status: "assigned" as const,
        assignment: {
          action: "assigned",
          signalId: "issue-known",
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

import { assignScoreToKnownSignalWorkflow } from "./assign-score-to-known-signal-workflow.ts"

describe("assignScoreToKnownSignalWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
  })

  it("runs embed, assign, and sync activities in order", async () => {
    const result = await assignScoreToKnownSignalWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      signalId: "issue-known",
    })

    expect(result).toEqual({
      action: "assigned",
      signalId: "issue-known",
    })

    expect(callOrder).toEqual(["embedScoreFeedback", "assignScoreToSignal", "syncScoreAnalytics"])

    expect(mockActivities.embedScoreFeedback).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })
    expect(mockActivities.assignScoreToSignal).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      signalId: "issue-known",
      normalizedEmbedding: [0.6, 0.8],
    })
    expect(mockActivities.syncScoreAnalytics).toHaveBeenCalledWith({
      organizationId: "org-1",
      scoreId: "score-1",
    })
    expect(mockSleep).not.toHaveBeenCalled()
  })
})
