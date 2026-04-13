import { Effect } from "effect"
import type {
  BaselineEvaluationResult,
  GeneratedEvaluationDraft,
  HydratedEvaluationAlignmentExample,
  IncrementalEvaluationRefreshResult,
} from "../../alignment/types.ts"
import type { ConfusionMatrix } from "../../entities/evaluation.ts"
import {
  decideAlignmentRefreshStrategy,
  deriveEvaluationAlignmentMetrics,
  emptyConfusionMatrix,
} from "../../helpers.ts"
import { evaluateDraftAgainstExamplesUseCase } from "./evaluate-draft-against-examples.ts"

export const evaluateIncrementalDraftUseCase = (input: {
  readonly issueName: string
  readonly issueDescription: string
  readonly draft: GeneratedEvaluationDraft
  readonly previousConfusionMatrix: ConfusionMatrix
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}) =>
  Effect.gen(function* () {
    const newExampleCount = input.positiveExamples.length + input.negativeExamples.length
    const previousMetrics = deriveEvaluationAlignmentMetrics(input.previousConfusionMatrix)

    if (newExampleCount === 0) {
      return {
        strategy: "no-op",
        previousConfusionMatrix: input.previousConfusionMatrix,
        incrementalConfusionMatrix: emptyConfusionMatrix(),
        nextConfusionMatrix: input.previousConfusionMatrix,
        metrics: previousMetrics,
        exampleResults: [],
        newExampleCount,
        previousMetrics,
        previousMatthewsCorrelationCoefficient: previousMetrics.matthewsCorrelationCoefficient,
        nextMatthewsCorrelationCoefficient: previousMetrics.matthewsCorrelationCoefficient,
        matthewsCorrelationCoefficientDrop: 0,
        confusionMatrix: emptyConfusionMatrix(),
      } satisfies IncrementalEvaluationRefreshResult
    }

    const incremental: BaselineEvaluationResult = yield* evaluateDraftAgainstExamplesUseCase({
      issueName: input.issueName,
      issueDescription: input.issueDescription,
      script: input.draft.script,
      positiveExamples: input.positiveExamples,
      negativeExamples: input.negativeExamples,
    })

    const decision = decideAlignmentRefreshStrategy({
      previousConfusionMatrix: input.previousConfusionMatrix,
      incrementalConfusionMatrix: incremental.confusionMatrix,
    })

    return {
      strategy: decision.strategy,
      previousConfusionMatrix: input.previousConfusionMatrix,
      incrementalConfusionMatrix: incremental.confusionMatrix,
      nextConfusionMatrix: decision.nextConfusionMatrix,
      metrics: deriveEvaluationAlignmentMetrics(decision.nextConfusionMatrix),
      exampleResults: incremental.exampleResults,
      newExampleCount,
      previousMetrics,
      previousMatthewsCorrelationCoefficient: decision.previousMatthewsCorrelationCoefficient,
      nextMatthewsCorrelationCoefficient: decision.nextMatthewsCorrelationCoefficient,
      matthewsCorrelationCoefficientDrop: decision.matthewsCorrelationCoefficientDrop,
      confusionMatrix: incremental.confusionMatrix,
    } satisfies IncrementalEvaluationRefreshResult
  })
