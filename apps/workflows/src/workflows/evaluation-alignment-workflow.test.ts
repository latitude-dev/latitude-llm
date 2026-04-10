import { wrapPromptAsScript } from "@domain/evaluations"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities, workflowRuntime, workflowPrimitives } = vi.hoisted(() => {
  const callOrder: string[] = []
  const stopRefreshLoop = new Error("stop refresh loop")
  type MockIncrementalRefreshResult = {
    readonly strategy: "metric-only" | "full-reoptimization" | "no-op"
    readonly previousConfusionMatrix: {
      readonly truePositives: number
      readonly falsePositives: number
      readonly falseNegatives: number
      readonly trueNegatives: number
    }
    readonly incrementalConfusionMatrix: {
      readonly truePositives: number
      readonly falsePositives: number
      readonly falseNegatives: number
      readonly trueNegatives: number
    }
    readonly nextConfusionMatrix: {
      readonly truePositives: number
      readonly falsePositives: number
      readonly falseNegatives: number
      readonly trueNegatives: number
    }
    readonly confusionMatrix: {
      readonly truePositives: number
      readonly falsePositives: number
      readonly falseNegatives: number
      readonly trueNegatives: number
    }
    readonly metrics: {
      readonly accuracy: number
      readonly precision: number
      readonly recall: number
      readonly f1: number
      readonly matthewsCorrelationCoefficient: number
    }
    readonly exampleResults: readonly unknown[]
    readonly newExampleCount: number
    readonly previousMetrics: {
      readonly accuracy: number
      readonly precision: number
      readonly recall: number
      readonly f1: number
      readonly matthewsCorrelationCoefficient: number
    }
    readonly previousMatthewsCorrelationCoefficient: number
    readonly nextMatthewsCorrelationCoefficient: number
    readonly matthewsCorrelationCoefficientDrop: number
  }
  let nowMs = new Date("2026-04-01T00:00:00.000Z").getTime()
  let conditionImpl: ((predicate: () => boolean, timeout?: number) => Promise<boolean>) | null = null
  let signalHandler: ((payload: { readonly reason: string; readonly jobId?: string | null }) => void) | null = null

  const mockActivities = {
    writeEvaluationAlignmentJobStatus: vi.fn(
      async (input: { readonly status: string; readonly error?: { readonly message: string } | null }) => {
        callOrder.push(`status:${input.status}`)
        return {
          jobId: "job-1",
          status: input.status,
          evaluationId: null,
          error: input.error ?? null,
        }
      },
    ),
    assertManualEvaluationRealignmentAllowed: vi.fn(async () => {
      callOrder.push("assertManualEvaluationRealignmentAllowed")
    }),
    loadEvaluationAlignmentState: vi.fn(async () => {
      callOrder.push("loadEvaluationAlignmentState")
      return {
        evaluationId: "eval-existing",
        issueId: "issue-1",
        issueName: "Tool output leakage",
        issueDescription: "Secrets are exposed in assistant tool output.",
        name: "Existing evaluation",
        description: "Existing evaluation description",
        alignedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
        draft: {
          script: wrapPromptAsScript("Evaluate the conversation for the issue."),
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
      }
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
        script: wrapPromptAsScript("Placeholder evaluation prompt."),
        evaluationHash: "hash-1",
        trigger: {
          filter: {},
          turn: "every",
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
          accuracy: 1,
          precision: 1,
          recall: 1,
          f1: 1,
          matthewsCorrelationCoefficient: 1,
        },
        exampleResults: [],
      }
    }),
    evaluateIncrementalEvaluationDraft: vi.fn(async (): Promise<MockIncrementalRefreshResult> => {
      callOrder.push("evaluateIncrementalEvaluationDraft")
      return {
        strategy: "metric-only" as const,
        previousConfusionMatrix: {
          truePositives: 3,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 4,
        },
        incrementalConfusionMatrix: {
          truePositives: 1,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 0,
        },
        nextConfusionMatrix: {
          truePositives: 4,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 4,
        },
        confusionMatrix: {
          truePositives: 1,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 0,
        },
        metrics: {
          accuracy: 1,
          precision: 1,
          recall: 1,
          f1: 1,
          matthewsCorrelationCoefficient: 1,
        },
        exampleResults: [],
        newExampleCount: 1,
        previousMetrics: {
          accuracy: 1,
          precision: 1,
          recall: 1,
          f1: 1,
          matthewsCorrelationCoefficient: 1,
        },
        previousMatthewsCorrelationCoefficient: 1,
        nextMatthewsCorrelationCoefficient: 1,
        matthewsCorrelationCoefficientDrop: 0,
      }
    }),
    generateEvaluationDetails: vi.fn(async () => {
      callOrder.push("generateEvaluationDetails")
      return {
        name: "Tool output leakage",
        description:
          "Checks whether the assistant leaks secrets. Passes when no secrets are exposed; fails when secret content appears in the response.",
      }
    }),
    persistEvaluationAlignmentResult: vi.fn(async () => {
      callOrder.push("persistEvaluationAlignmentResult")
      return {
        evaluationId: "eval-1",
      }
    }),
  }

  return {
    callOrder,
    mockActivities,
    workflowRuntime: {
      get nowMs() {
        return nowMs
      },
      set nowMs(value: number) {
        nowMs = value
      },
      reset() {
        nowMs = new Date("2026-04-01T00:00:00.000Z").getTime()
        signalHandler = null
        conditionImpl = null
      },
      stopRefreshLoop,
      get signalHandler() {
        return signalHandler
      },
      set signalHandler(handler: typeof signalHandler) {
        signalHandler = handler
      },
      setConditionImpl(impl: typeof conditionImpl) {
        conditionImpl = impl
      },
    },
    workflowPrimitives: {
      condition: vi.fn(async (predicate: () => boolean, timeout?: number) => {
        if (!conditionImpl) {
          throw stopRefreshLoop
        }

        return conditionImpl(predicate, timeout)
      }),
    },
  }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
  defineSignal: (name: string) => name,
  setHandler: (_signal: string, handler: typeof workflowRuntime.signalHandler) => {
    workflowRuntime.signalHandler = handler
  },
  condition: workflowPrimitives.condition,
}))

import { evaluationAlignmentWorkflow } from "./evaluation-alignment-workflow.ts"

describe("evaluationAlignmentWorkflow", () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
    workflowRuntime.reset()
    workflowRuntime.setConditionImpl(null)
    dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => workflowRuntime.nowMs)
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  it("runs the scaffolded alignment pipeline in order", async () => {
    const result = await evaluationAlignmentWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      jobId: "job-1",
      evaluationId: null,
      reason: "initial-generation",
    })

    expect(result).toEqual({
      jobId: "job-1",
      evaluationId: "eval-1",
      positiveExampleCount: 1,
      negativeExampleCount: 1,
    })

    expect(callOrder).toEqual([
      "status:running",
      "collectEvaluationAlignmentExamples",
      "generateBaselineEvaluationDraft",
      "optimizeEvaluationDraft",
      "evaluateBaselineEvaluationDraft",
      "generateEvaluationDetails",
      "persistEvaluationAlignmentResult",
      "status:completed",
    ])

    expect(mockActivities.generateEvaluationDetails).toHaveBeenCalledWith({
      issueName: "Tool output leakage",
      issueDescription: "Secrets are exposed in assistant tool output.",
      script: wrapPromptAsScript("Placeholder evaluation prompt."),
    })
  })

  it("writes failed status before surfacing activity errors", async () => {
    mockActivities.assertManualEvaluationRealignmentAllowed.mockImplementationOnce(async () => {
      callOrder.push("assertManualEvaluationRealignmentAllowed")
    })
    mockActivities.generateBaselineEvaluationDraft.mockImplementationOnce(async () => {
      callOrder.push("generateBaselineEvaluationDraft")
      throw Object.assign(new Error("baseline generation failed"), {
        _tag: "EvaluationBaselineGenerationError",
      })
    })

    await expect(
      evaluationAlignmentWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        issueId: "issue-1",
        jobId: "job-1",
        evaluationId: "eval-existing",
        reason: "manual-realignment",
      }),
    ).rejects.toThrow("baseline generation failed")

    expect(callOrder).toEqual([
      "status:running",
      "assertManualEvaluationRealignmentAllowed",
      "loadEvaluationAlignmentState",
      "collectEvaluationAlignmentExamples",
      "generateBaselineEvaluationDraft",
      "status:failed",
    ])
  })

  it("persists a metric-only incremental refresh inside the long-lived loop", async () => {
    workflowRuntime.setConditionImpl(async (_predicate, timeout) => {
      if (timeout !== undefined) {
        workflowRuntime.nowMs += timeout
        workflowRuntime.setConditionImpl(async () => {
          throw workflowRuntime.stopRefreshLoop
        })
        return false
      }

      throw workflowRuntime.stopRefreshLoop
    })

    await expect(
      evaluationAlignmentWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        issueId: "issue-1",
        jobId: "auto-refresh:eval-existing",
        evaluationId: "eval-existing",
        refreshLoop: true,
        reason: "debounced-metric-refresh",
      }),
    ).rejects.toThrow("stop refresh loop")

    expect(callOrder).toEqual([
      "loadEvaluationAlignmentState",
      "collectEvaluationAlignmentExamples",
      "evaluateIncrementalEvaluationDraft",
      "persistEvaluationAlignmentResult",
    ])
    expect(mockActivities.writeEvaluationAlignmentJobStatus).not.toHaveBeenCalled()
  })

  it("coalesces repeated metric-refresh signals into one incremental pass", async () => {
    let waitForSignal = true
    workflowRuntime.setConditionImpl(async (_predicate, timeout) => {
      if (timeout === undefined && waitForSignal) {
        waitForSignal = false
        workflowRuntime.signalHandler?.({
          reason: "debounced-metric-refresh",
          jobId: "auto-refresh:eval-existing",
        })
        workflowRuntime.signalHandler?.({
          reason: "debounced-metric-refresh",
          jobId: "auto-refresh:eval-existing",
        })
        return true
      }

      if (timeout !== undefined) {
        workflowRuntime.nowMs += timeout
        workflowRuntime.setConditionImpl(async () => {
          throw workflowRuntime.stopRefreshLoop
        })
        return false
      }

      throw workflowRuntime.stopRefreshLoop
    })

    await expect(
      evaluationAlignmentWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        issueId: "issue-1",
        jobId: "refresh-loop",
        evaluationId: "eval-existing",
        refreshLoop: true,
        reason: "initial-generation",
      }),
    ).rejects.toThrow("stop refresh loop")

    expect(callOrder).toEqual([
      "loadEvaluationAlignmentState",
      "collectEvaluationAlignmentExamples",
      "evaluateIncrementalEvaluationDraft",
      "persistEvaluationAlignmentResult",
    ])
    expect(mockActivities.evaluateIncrementalEvaluationDraft).toHaveBeenCalledTimes(1)
  })

  it("escalates an incremental MCC drop into the full re-optimization branch", async () => {
    mockActivities.evaluateIncrementalEvaluationDraft.mockImplementationOnce(async () => {
      callOrder.push("evaluateIncrementalEvaluationDraft")
      return {
        strategy: "full-reoptimization" as const,
        previousConfusionMatrix: {
          truePositives: 3,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 4,
        },
        incrementalConfusionMatrix: {
          truePositives: 0,
          falsePositives: 2,
          falseNegatives: 1,
          trueNegatives: 0,
        },
        nextConfusionMatrix: {
          truePositives: 3,
          falsePositives: 2,
          falseNegatives: 1,
          trueNegatives: 4,
        },
        confusionMatrix: {
          truePositives: 0,
          falsePositives: 2,
          falseNegatives: 1,
          trueNegatives: 0,
        },
        metrics: {
          accuracy: 0.7,
          precision: 0.6,
          recall: 0.75,
          f1: 0.66,
          matthewsCorrelationCoefficient: 0.4,
        },
        exampleResults: [],
        newExampleCount: 3,
        previousMetrics: {
          accuracy: 1,
          precision: 1,
          recall: 1,
          f1: 1,
          matthewsCorrelationCoefficient: 1,
        },
        previousMatthewsCorrelationCoefficient: 1,
        nextMatthewsCorrelationCoefficient: 0.4,
        matthewsCorrelationCoefficientDrop: 0.6,
      }
    })
    workflowRuntime.setConditionImpl(async (_predicate, timeout) => {
      if (timeout !== undefined) {
        workflowRuntime.nowMs += timeout
        workflowRuntime.setConditionImpl(async () => {
          throw workflowRuntime.stopRefreshLoop
        })
        return false
      }

      throw workflowRuntime.stopRefreshLoop
    })

    await expect(
      evaluationAlignmentWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        issueId: "issue-1",
        jobId: "auto-refresh:eval-existing",
        evaluationId: "eval-existing",
        refreshLoop: true,
        reason: "debounced-metric-refresh",
      }),
    ).rejects.toThrow("stop refresh loop")

    expect(callOrder).toEqual([
      "loadEvaluationAlignmentState",
      "collectEvaluationAlignmentExamples",
      "evaluateIncrementalEvaluationDraft",
      "loadEvaluationAlignmentState",
      "collectEvaluationAlignmentExamples",
      "generateBaselineEvaluationDraft",
      "optimizeEvaluationDraft",
      "evaluateBaselineEvaluationDraft",
      "persistEvaluationAlignmentResult",
    ])
  })

  it("runs a manual signal through the full realignment path inside the refresh loop", async () => {
    let waitForSignal = true
    workflowRuntime.setConditionImpl(async () => {
      if (waitForSignal) {
        waitForSignal = false
        workflowRuntime.signalHandler?.({
          reason: "manual-realignment",
          jobId: "manual-job-1",
        })
        return true
      }

      throw workflowRuntime.stopRefreshLoop
    })

    await expect(
      evaluationAlignmentWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        issueId: "issue-1",
        jobId: "refresh-loop",
        evaluationId: "eval-existing",
        refreshLoop: true,
        reason: "initial-generation",
      }),
    ).rejects.toThrow("stop refresh loop")

    expect(callOrder).toEqual([
      "status:running",
      "assertManualEvaluationRealignmentAllowed",
      "loadEvaluationAlignmentState",
      "collectEvaluationAlignmentExamples",
      "generateBaselineEvaluationDraft",
      "optimizeEvaluationDraft",
      "evaluateBaselineEvaluationDraft",
      "persistEvaluationAlignmentResult",
      "status:completed",
    ])
    expect(mockActivities.writeEvaluationAlignmentJobStatus).toHaveBeenNthCalledWith(1, {
      jobId: "manual-job-1",
      status: "running",
      evaluationId: "eval-existing",
    })
  })
})
