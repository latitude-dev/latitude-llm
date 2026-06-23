import type { ConfusionMatrix, EvaluationTrigger } from "../entities/evaluation.ts"
import type { EvaluationAlignmentMetrics } from "../helpers.ts"
import type { EvaluationAlignmentExample } from "../ports/evaluation-alignment-examples-repository.ts"
import type { EvaluationConversationMessage } from "../runtime/evaluation-execution.ts"

export interface HydratedEvaluationAlignmentExample extends EvaluationAlignmentExample {
  readonly conversation: readonly EvaluationConversationMessage[]
  readonly conversationText: string
}

export interface GeneratedEvaluationDraft {
  readonly script: string
  readonly evaluationHash: string
  readonly trigger: EvaluationTrigger
}

export interface LoadedEvaluationAlignmentState {
  readonly evaluationId: string
  readonly signalId: string
  readonly signalName: string
  readonly signalDescription: string
  readonly name: string
  readonly description: string
  readonly alignedAt: string
  readonly membershipOnPass: boolean
  readonly draft: GeneratedEvaluationDraft
  readonly confusionMatrix: ConfusionMatrix
}

export interface BaselineEvaluationExampleResult {
  readonly traceId: string
  readonly expectedPositive: boolean
  readonly predictedPositive: boolean
  readonly feedback: string
}

export interface BaselineEvaluationResult {
  readonly confusionMatrix: ConfusionMatrix
  readonly metrics: EvaluationAlignmentMetrics
  readonly exampleResults: readonly BaselineEvaluationExampleResult[]
}

export interface IncrementalEvaluationRefreshResult extends BaselineEvaluationResult {
  readonly strategy: "no-op" | "metric-only" | "full-reoptimization"
  readonly previousConfusionMatrix: ConfusionMatrix
  readonly incrementalConfusionMatrix: ConfusionMatrix
  readonly nextConfusionMatrix: ConfusionMatrix
  readonly newExampleCount: number
  readonly previousMetrics: EvaluationAlignmentMetrics
  readonly previousAlignmentMetric: number
  readonly nextAlignmentMetric: number
  readonly alignmentMetricDrop: number
}

export interface PersistEvaluationAlignmentResult {
  readonly evaluationId: string
}

export interface CollectedEvaluationAlignmentExamples {
  readonly signalId: string
  readonly signalName: string
  readonly signalDescription: string
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}
