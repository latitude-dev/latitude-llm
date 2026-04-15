import { Effect } from "effect"
import type {
  BaselineEvaluationExampleResult,
  BaselineEvaluationResult,
  HydratedEvaluationAlignmentExample,
} from "../../alignment/types.ts"
import { addConfusionMatrixObservation, deriveEvaluationAlignmentMetrics, emptyConfusionMatrix } from "../../helpers.ts"
import { executeEvaluationScriptWithAI } from "../../runtime/evaluation-execution.ts"

// TODO(eval-sandbox): when sandbox is available, executeEvaluationScript will run arbitrary JS;
// this function delegates to it and its structure won't change.
export const evaluateDraftAgainstExamplesUseCase = (input: {
  readonly issueName: string
  readonly issueDescription: string
  readonly script: string
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}) =>
  Effect.gen(function* () {
    const examples = [...input.positiveExamples, ...input.negativeExamples]
    let confusionMatrix = emptyConfusionMatrix()
    const exampleResults: BaselineEvaluationExampleResult[] = []

    for (const example of examples) {
      const execution = yield* executeEvaluationScriptWithAI({
        script: input.script,
        conversation: example.conversation,
        issue: {
          name: input.issueName,
          description: input.issueDescription,
        },
      })

      const expectedPositive = example.label === "positive"
      const predictedPositive = execution.result.passed === false

      confusionMatrix = addConfusionMatrixObservation(confusionMatrix, {
        expectedPositive,
        predictedPositive,
      })

      exampleResults.push({
        traceId: example.traceId,
        expectedPositive,
        predictedPositive,
        feedback: execution.result.feedback,
      })
    }

    return {
      confusionMatrix,
      metrics: deriveEvaluationAlignmentMetrics(confusionMatrix),
      exampleResults,
    } satisfies BaselineEvaluationResult
  })
