import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities } = vi.hoisted(() => {
  const callOrder: string[] = []

  type ConfusionMatrix = {
    readonly truePositives: number
    readonly falsePositives: number
    readonly falseNegatives: number
    readonly trueNegatives: number
  }
  type LoadResult =
    | { readonly status: "inactive" }
    | {
        readonly status: "active"
        readonly state: {
          readonly evaluationId: string
          readonly issueId: string
          readonly issueName: string
          readonly issueDescription: string
          readonly name: string
          readonly description: string
          readonly alignedAt: string
          readonly draft: {
            readonly script: string
            readonly evaluationHash: string
            readonly trigger: {
              readonly filter: Record<string, unknown>
              readonly turn: "first" | "every" | "last"
              readonly debounce: number
              readonly sampling: number
            }
          }
          readonly confusionMatrix: ConfusionMatrix
        }
      }

  const activeState: LoadResult = {
    status: "active",
    state: {
      evaluationId: "eval-existing",
      issueId: "issue-1",
      issueName: "Tool output leakage",
      issueDescription: "Secrets are exposed in assistant tool output.",
      name: "Existing evaluation",
      description: "Existing evaluation description",
      alignedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
      draft: {
        script: "/* Evaluate the conversation for the issue. */",
        evaluationHash: "hash-existing",
        trigger: {
          filter: {},
          turn: "every",
          debounce: 0,
          sampling: 100,
        },
      },
      confusionMatrix: {
        truePositives: 3,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 4,
      },
    },
  }

  const mockActivities = {
    loadEvaluationAlignmentStateOrInactive: vi.fn(async (): Promise<LoadResult> => {
      callOrder.push("loadEvaluationAlignmentStateOrInactive")
      return activeState
    }),
    collectEvaluationAlignmentExamples: vi.fn(async () => {
      callOrder.push("collectEvaluationAlignmentExamples")
      return {
        issueId: "issue-1",
        issueName: "Tool output leakage",
        issueDescription: "Secrets are exposed in assistant tool output.",
        positiveExamples: [
          {
            traceId: "trace-positive",
            sessionId: null,
            scoreIds: ["score-1"],
            label: "positive",
            negativePriority: null,
            annotationFeedback: "Leaked deployment token in response",
            conversation: [
              { role: "user", content: "Please print the deployment token." },
              { role: "assistant", content: "Here is the token: sk-live-123" },
            ],
            conversationText: "User: Please print the deployment token.\n\nAssistant: Here is the token: sk-live-123",
          },
        ],
        negativeExamples: [
          {
            traceId: "trace-negative",
            sessionId: null,
            scoreIds: ["score-2"],
            label: "negative",
            negativePriority: "no-failed-scores",
            annotationFeedback: null,
            conversation: [
              { role: "user", content: "Summarize the deployment checklist." },
              { role: "assistant", content: "Here is the checklist summary." },
            ],
            conversationText: "User: Summarize the deployment checklist.\n\nAssistant: Here is the checklist summary.",
          },
        ],
      }
    }),
    generateBaselineEvaluationDraft: vi.fn(async () => {
      callOrder.push("generateBaselineEvaluationDraft")
      return {
        script: "/* Placeholder evaluation prompt. */",
        evaluationHash: "hash-1",
        trigger: {
          filter: {},
          turn: "every" as const,
          debounce: 0,
          sampling: 100,
        },
      }
    }),
    optimizeEvaluationDraft: vi.fn(async ({ draft }: { readonly draft: unknown }) => {
      callOrder.push("optimizeEvaluationDraft")
      return draft
    }),
    evaluateBaselineEvaluationDraft: vi.fn(async () => {
      callOrder.push("evaluateBaselineEvaluationDraft")
      return {
        confusionMatrix: {
          truePositives: 1,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 1,
        },
        metrics: {
          alignmentMetric: 1,
          accuracy: 1,
          precision: 1,
          recall: 1,
          specificity: 1,
          f1: 1,
          balancedAccuracy: 1,
          matthewsCorrelationCoefficient: 1,
        },
        exampleResults: [],
      }
    }),
    persistEvaluationAlignmentResult: vi.fn(async (_input: Record<string, unknown>) => {
      callOrder.push("persistEvaluationAlignmentResult")
      return { evaluationId: "eval-1" }
    }),
  }

  return { callOrder, mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
}))

import { optimizeEvaluationWorkflow } from "./optimize-evaluation-workflow.ts"

describe("optimizeEvaluationWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
  })

  it("runs the full pipeline for initial generation without passing name/description", async () => {
    const result = await optimizeEvaluationWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: null,
      jobId: "job-1",
    })

    expect(result).toEqual({
      status: "optimized",
      evaluationId: "eval-1",
      positiveExampleCount: 1,
      negativeExampleCount: 1,
    })
    expect(callOrder).toEqual([
      "collectEvaluationAlignmentExamples",
      "generateBaselineEvaluationDraft",
      "optimizeEvaluationDraft",
      "evaluateBaselineEvaluationDraft",
      "persistEvaluationAlignmentResult",
    ])
    expect(mockActivities.loadEvaluationAlignmentStateOrInactive).not.toHaveBeenCalled()
    const persistArgs = mockActivities.persistEvaluationAlignmentResult.mock.calls[0]?.[0]
    expect(persistArgs).not.toHaveProperty("name")
    expect(persistArgs).not.toHaveProperty("description")
  })

  it("re-optimizes an existing evaluation without passing name/description", async () => {
    const result = await optimizeEvaluationWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "eval-existing",
      jobId: "job-1",
    })

    expect(result.status).toBe("optimized")
    expect(callOrder).toEqual([
      "loadEvaluationAlignmentStateOrInactive",
      "collectEvaluationAlignmentExamples",
      "generateBaselineEvaluationDraft",
      "optimizeEvaluationDraft",
      "evaluateBaselineEvaluationDraft",
      "persistEvaluationAlignmentResult",
    ])
    const persistArgs = mockActivities.persistEvaluationAlignmentResult.mock.calls[0]?.[0]
    expect(persistArgs).not.toHaveProperty("name")
    expect(persistArgs).not.toHaveProperty("description")
  })

  it("short-circuits on an inactive evaluation before running any downstream activity", async () => {
    mockActivities.loadEvaluationAlignmentStateOrInactive.mockImplementationOnce(async () => {
      callOrder.push("loadEvaluationAlignmentStateOrInactive")
      return { status: "inactive" }
    })

    const result = await optimizeEvaluationWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "eval-existing",
      jobId: "job-1",
    })

    expect(result).toEqual({ status: "inactive" })
    expect(callOrder).toEqual(["loadEvaluationAlignmentStateOrInactive"])
    expect(mockActivities.collectEvaluationAlignmentExamples).not.toHaveBeenCalled()
  })
})
