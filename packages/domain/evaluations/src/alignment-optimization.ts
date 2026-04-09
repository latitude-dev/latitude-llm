import { AI } from "@domain/ai"
import type { OptimizationCandidate, OptimizationTrajectory } from "@domain/optimizations"
import { Effect } from "effect"
import { executeEvaluationScript } from "./alignment-execution.ts"
import type { HydratedEvaluationAlignmentExample } from "./alignment-types.ts"
import {
  EVALUATION_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  type EvaluationScriptSchema,
} from "./baseline-generation.ts"

// TODO(eval-sandbox): when sandbox is available, executeEvaluationScript will run arbitrary JS
// and this function's structure will remain the same — it just calls executeEvaluationScript.
export const evaluateOptimizationCandidate = (input: {
  readonly candidate: OptimizationCandidate
  readonly example: HydratedEvaluationAlignmentExample
  readonly issueName: string
  readonly issueDescription: string
}) =>
  Effect.gen(function* () {
    const ai = yield* AI
    const services = yield* Effect.services<never>()
    const execution = yield* Effect.tryPromise(() =>
      executeEvaluationScript({
        script: input.candidate.text,
        conversation: input.example.conversation,
        issue: {
          name: input.issueName,
          description: input.issueDescription,
        },
        generateStructuredObject: <T>(llmInput: {
          readonly prompt: string
          readonly schema: EvaluationScriptSchema<T>
        }) =>
          Effect.runPromiseWith(services)(
            ai.generate({
              ...EVALUATION_SCRIPT_RUNTIME_MODEL,
              system: EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
              prompt: llmInput.prompt,
              schema: llmInput.schema,
            }),
          ),
      }),
    )

    const expectedPositive = input.example.label === "positive"
    const predictedPositive = execution.result.passed === false
    const score = expectedPositive === predictedPositive ? 1 : 0

    return {
      trajectory: {
        id: input.example.traceId,
        conversationText: input.example.conversationText,
        feedback: execution.result.feedback,
        ...(input.example.annotationFeedback ? { annotationContext: input.example.annotationFeedback } : {}),
        expectedPositive,
        predictedPositive,
        passed: execution.result.passed,
        score,
        totalTokens: execution.totalTokens,
      } satisfies OptimizationTrajectory,
    }
  })
