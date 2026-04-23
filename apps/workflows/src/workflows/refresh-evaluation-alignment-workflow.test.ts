import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities } = vi.hoisted(() => {
  const callOrder: string[] = []

  type ConfusionMatrix = {
    readonly truePositives: number
    readonly falsePositives: number
    readonly falseNegatives: number
    readonly trueNegatives: number
  }
  type Metrics = {
    readonly accuracy: number
    readonly precision: number
    readonly recall: number
    readonly f1: number
    readonly specificity: number
    readonly trueness: number
    readonly balancedAccuracy: number
    readonly alignmentMetric: number
    readonly matthewsCorrelationCoefficient: number
  }
  type IncrementalResult = {
    readonly strategy: "metric-only" | "full-reoptimization" | "no-op"
    readonly previousConfusionMatrix: ConfusionMatrix
    readonly incrementalConfusionMatrix: ConfusionMatrix
    readonly nextConfusionMatrix: ConfusionMatrix
    readonly confusionMatrix: ConfusionMatrix
    readonly metrics: Metrics
    readonly exampleResults: readonly unknown[]
    readonly newExampleCount: number
    readonly previousMetrics: Metrics
    readonly previousAlignmentMetric: number
    readonly nextAlignmentMetric: number
    readonly alignmentMetricDrop: number
  }
  type LoadResult =
    | { readonly status: "inactive" }
    | {
        readonly status: "active"
        readonly incrementalEligible: boolean
        readonly currentScriptHash: string
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
    incrementalEligible: true,
    currentScriptHash: "hash-existing",
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
        positiveExamples: [],
        negativeExamples: [],
      }
    }),
    evaluateIncrementalEvaluationDraft: vi.fn(async (): Promise<IncrementalResult> => {
      callOrder.push("evaluateIncrementalEvaluationDraft")
      return {
        strategy: "metric-only",
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
          alignmentMetric: 1,
          accuracy: 1,
          precision: 1,
          recall: 1,
          specificity: 1,
          trueness: 1,
          f1: 1,
          balancedAccuracy: 1,
          matthewsCorrelationCoefficient: 1,
        },
        exampleResults: [],
        newExampleCount: 1,
        previousMetrics: {
          alignmentMetric: 1,
          accuracy: 1,
          precision: 1,
          recall: 1,
          specificity: 1,
          trueness: 1,
          f1: 1,
          balancedAccuracy: 1,
          matthewsCorrelationCoefficient: 1,
        },
        previousAlignmentMetric: 1,
        nextAlignmentMetric: 1,
        alignmentMetricDrop: 0,
      }
    }),
    evaluateBaselineEvaluationDraft: vi.fn(async () => {
      callOrder.push("evaluateBaselineEvaluationDraft")
      return {
        confusionMatrix: {
          truePositives: 2,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 2,
        },
        metrics: {
          alignmentMetric: 1,
          accuracy: 1,
          precision: 1,
          recall: 1,
          specificity: 1,
          trueness: 1,
          f1: 1,
          balancedAccuracy: 1,
          matthewsCorrelationCoefficient: 1,
        },
        exampleResults: [],
      }
    }),
    persistEvaluationAlignmentResult: vi.fn(async () => {
      callOrder.push("persistEvaluationAlignmentResult")
      return { evaluationId: "eval-existing" }
    }),
    scheduleEvaluationOptimization: vi.fn(async () => {
      callOrder.push("scheduleEvaluationOptimization")
    }),
  }

  return { callOrder, mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
}))

import { refreshEvaluationAlignmentWorkflow } from "./refresh-evaluation-alignment-workflow.ts"

describe("refreshEvaluationAlignmentWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
  })

  it("persists the refreshed confusion matrix on a metric-only outcome and does not publish optimization", async () => {
    const result = await refreshEvaluationAlignmentWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "eval-existing",
    })

    expect(result).toEqual({ status: "metric-only", newExampleCount: 1 })
    expect(callOrder).toEqual([
      "loadEvaluationAlignmentStateOrInactive",
      "collectEvaluationAlignmentExamples",
      "evaluateIncrementalEvaluationDraft",
      "persistEvaluationAlignmentResult",
    ])
    expect(mockActivities.scheduleEvaluationOptimization).not.toHaveBeenCalled()
  })

  it("publishes an automaticOptimization task and does not persist when the incremental result escalates", async () => {
    mockActivities.evaluateIncrementalEvaluationDraft.mockImplementationOnce(async () => {
      callOrder.push("evaluateIncrementalEvaluationDraft")
      return {
        strategy: "full-reoptimization",
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
          alignmentMetric: 0.4,
          accuracy: 0.7,
          precision: 0.6,
          recall: 0.75,
          specificity: 0.5,
          trueness: 0.5,
          f1: 0.66,
          balancedAccuracy: 0.4,
          matthewsCorrelationCoefficient: 0.4,
        },
        exampleResults: [],
        newExampleCount: 3,
        previousMetrics: {
          alignmentMetric: 1,
          accuracy: 1,
          precision: 1,
          recall: 1,
          specificity: 1,
          trueness: 1,
          f1: 1,
          balancedAccuracy: 1,
          matthewsCorrelationCoefficient: 1,
        },
        previousAlignmentMetric: 1,
        nextAlignmentMetric: 0.4,
        alignmentMetricDrop: 0.6,
      }
    })

    const result = await refreshEvaluationAlignmentWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "eval-existing",
    })

    expect(result).toEqual({ status: "escalated-to-optimization", newExampleCount: 3 })
    expect(callOrder).toEqual([
      "loadEvaluationAlignmentStateOrInactive",
      "collectEvaluationAlignmentExamples",
      "evaluateIncrementalEvaluationDraft",
      "scheduleEvaluationOptimization",
    ])
    expect(mockActivities.persistEvaluationAlignmentResult).not.toHaveBeenCalled()
    expect(mockActivities.scheduleEvaluationOptimization).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "eval-existing",
    })
  })

  it("short-circuits on an inactive evaluation before running any downstream activity", async () => {
    mockActivities.loadEvaluationAlignmentStateOrInactive.mockImplementationOnce(async () => {
      callOrder.push("loadEvaluationAlignmentStateOrInactive")
      return { status: "inactive" }
    })

    const result = await refreshEvaluationAlignmentWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "eval-existing",
    })

    expect(result).toEqual({ status: "inactive" })
    expect(callOrder).toEqual(["loadEvaluationAlignmentStateOrInactive"])
    expect(mockActivities.collectEvaluationAlignmentExamples).not.toHaveBeenCalled()
    expect(mockActivities.evaluateIncrementalEvaluationDraft).not.toHaveBeenCalled()
    expect(mockActivities.persistEvaluationAlignmentResult).not.toHaveBeenCalled()
    expect(mockActivities.scheduleEvaluationOptimization).not.toHaveBeenCalled()
  })

  it("returns no-op without persisting when the incremental evaluator has nothing to do", async () => {
    mockActivities.evaluateIncrementalEvaluationDraft.mockImplementationOnce(async () => {
      callOrder.push("evaluateIncrementalEvaluationDraft")
      return {
        strategy: "no-op",
        previousConfusionMatrix: {
          truePositives: 3,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 4,
        },
        incrementalConfusionMatrix: {
          truePositives: 0,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 0,
        },
        nextConfusionMatrix: {
          truePositives: 3,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 4,
        },
        confusionMatrix: {
          truePositives: 0,
          falsePositives: 0,
          falseNegatives: 0,
          trueNegatives: 0,
        },
        metrics: {
          alignmentMetric: 1,
          accuracy: 1,
          precision: 1,
          recall: 1,
          specificity: 1,
          trueness: 1,
          f1: 1,
          balancedAccuracy: 1,
          matthewsCorrelationCoefficient: 1,
        },
        exampleResults: [],
        newExampleCount: 0,
        previousMetrics: {
          alignmentMetric: 1,
          accuracy: 1,
          precision: 1,
          recall: 1,
          specificity: 1,
          trueness: 1,
          f1: 1,
          balancedAccuracy: 1,
          matthewsCorrelationCoefficient: 1,
        },
        previousAlignmentMetric: 1,
        nextAlignmentMetric: 1,
        alignmentMetricDrop: 0,
      }
    })

    const result = await refreshEvaluationAlignmentWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "eval-existing",
    })

    expect(result).toEqual({ status: "no-op", newExampleCount: 0 })
    expect(mockActivities.persistEvaluationAlignmentResult).not.toHaveBeenCalled()
    expect(mockActivities.scheduleEvaluationOptimization).not.toHaveBeenCalled()
  })

  it("rebuilds the matrix from scratch against all examples when the script hash drifts", async () => {
    mockActivities.loadEvaluationAlignmentStateOrInactive.mockImplementationOnce(async () => {
      callOrder.push("loadEvaluationAlignmentStateOrInactive")
      return {
        status: "active",
        incrementalEligible: false,
        currentScriptHash: "sha1-of-the-live-script",
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
            evaluationHash: "stale-hash-from-previous-script",
            trigger: {
              filter: {},
              turn: "every" as const,
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
    })
    mockActivities.collectEvaluationAlignmentExamples.mockImplementationOnce(async () => {
      callOrder.push("collectEvaluationAlignmentExamples")
      return {
        issueId: "issue-1",
        issueName: "Tool output leakage",
        issueDescription: "Secrets are exposed in assistant tool output.",
        positiveExamples: [{}, {}] as never,
        negativeExamples: [{}, {}, {}] as never,
      }
    })

    const result = await refreshEvaluationAlignmentWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "eval-existing",
    })

    expect(result).toEqual({ status: "full-metric-rebuild", totalExampleCount: 5 })
    expect(callOrder).toEqual([
      "loadEvaluationAlignmentStateOrInactive",
      "collectEvaluationAlignmentExamples",
      "evaluateBaselineEvaluationDraft",
      "persistEvaluationAlignmentResult",
    ])
    // The rebuild skips the incremental evaluator entirely — it would merge
    // judgments from two different scripts into the same matrix.
    expect(mockActivities.evaluateIncrementalEvaluationDraft).not.toHaveBeenCalled()
    // Rebuild does not escalate to GEPA; alignment metric drop is evaluated
    // again on the next incremental pass (now in the eligible path again).
    expect(mockActivities.scheduleEvaluationOptimization).not.toHaveBeenCalled()
    // Example collection is unscoped (no `createdAfter`) and disables the
    // positive-examples requirement — a rebuild that lands with zero
    // positives is still a legitimate outcome (hash is refreshed, matrix
    // becomes empty) and must not be rejected as a BadRequest.
    expect(mockActivities.collectEvaluationAlignmentExamples).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      requirePositiveExamples: false,
    })
    // The freshly computed hash replaces the stale one so subsequent refreshes
    // are back on the incremental-eligible path.
    expect(mockActivities.persistEvaluationAlignmentResult).toHaveBeenCalledWith(
      expect.objectContaining({ evaluationHash: "sha1-of-the-live-script" }),
    )
  })
})
