import { minimalScriptSession } from "@domain/sandbox"
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
import { executeEvaluationScriptSandboxed } from "../../runtime/sandbox-execution.ts"

export const evaluateDraftAgainstExamplesUseCase = Effect.fn("evaluations.evaluateDraftAgainstExamples")(
  function* (input: {
    readonly signalName: string
    readonly signalDescription: string
    readonly script: string
    readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
    readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
    readonly judgeTelemetry: EvaluationAlignmentJudgeTelemetryScope
  }) {
    const examples = [...input.positiveExamples, ...input.negativeExamples]
    let confusionMatrix = emptyConfusionMatrix()
    const exampleResults: BaselineEvaluationExampleResult[] = []

    for (const example of examples) {
      const execution = yield* executeEvaluationScriptSandboxed({
        script: input.script,
        session: minimalScriptSession(example.conversation),
        telemetry: buildEvaluationAlignmentJudgeTelemetryCapture({
          scope: input.judgeTelemetry,
          traceId: String(example.traceId),
          exampleLabel: example.label,
        }),
      })

      const expectedPositive = example.label === "positive"
      const predictedPositive = execution.result.passed === true

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
