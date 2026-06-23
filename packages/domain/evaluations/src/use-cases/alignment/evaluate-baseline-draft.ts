import { Effect } from "effect"
import type { HydratedEvaluationAlignmentExample } from "../../alignment/types.ts"
import type { EvaluationAlignmentJudgeTelemetryScope } from "../../runtime/ai-telemetry.ts"
import { evaluateDraftAgainstExamplesUseCase } from "./evaluate-draft-against-examples.ts"

export const evaluateBaselineDraftUseCase = (input: {
  readonly signalName: string
  readonly signalDescription: string
  readonly script: string
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly judgeTelemetry: EvaluationAlignmentJudgeTelemetryScope
}) =>
  evaluateDraftAgainstExamplesUseCase({
    signalName: input.signalName,
    signalDescription: input.signalDescription,
    script: input.script,
    positiveExamples: input.positiveExamples,
    negativeExamples: input.negativeExamples,
    judgeTelemetry: input.judgeTelemetry,
  }).pipe(Effect.withSpan("evaluations.evaluateBaselineDraft"))
