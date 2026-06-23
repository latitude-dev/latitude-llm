import { Effect } from "effect"
import type {
  BaselineEvaluationExampleResult,
  BaselineEvaluationResult,
  HydratedEvaluationAlignmentExample,
} from "../../alignment/types.ts"
import { addConfusionMatrixObservation, deriveEvaluationAlignmentMetrics, emptyConfusionMatrix } from "../../helpers.ts"
import {
  buildEvaluationAlignmentJudgeTelemetryCapture,
  type EvaluationAlignmentJudgeTelemetryScope,
} from "../../runtime/ai-telemetry.ts"
import { executeEvaluationScriptWithAI } from "../../runtime/evaluation-execution.ts"

// TODO(eval-sandbox): when sandbox is available, executeEvaluationScript will run arbitrary JS;
// this function delegates to it and its structure won't change.
export const evaluateDraftAgainstExamplesUseCase = Effect.fn("evaluations.evaluateDraftAgainstExamples")(
  function* (input: {
    readonly signalName: string
    readonly signalDescription: string
    readonly script: string
    readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
    readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
    readonly judgeTelemetry: EvaluationAlignmentJudgeTelemetryScope
    readonly membershipOnPass?: boolean
  }) {
    const examples = [...input.positiveExamples, ...input.negativeExamples]
    let confusionMatrix = emptyConfusionMatrix()
    const exampleResults: BaselineEvaluationExampleResult[] = []

    for (const example of examples) {
      const execution = yield* executeEvaluationScriptWithAI({
        script: input.script,
        conversation: example.conversation,
        issue: {
          name: input.signalName,
          description: input.signalDescription,
        },
        telemetry: buildEvaluationAlignmentJudgeTelemetryCapture({
          scope: input.judgeTelemetry,
          traceId: String(example.traceId),
          exampleLabel: example.label,
        }),
      })

      const expectedPositive = example.label === "positive"
      const predictedPositive = input.membershipOnPass
        ? execution.result.passed === true
        : execution.result.passed === false

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
  },
)
