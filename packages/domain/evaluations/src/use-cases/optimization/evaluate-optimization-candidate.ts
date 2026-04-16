import type { OptimizationCandidate, OptimizationTrajectory } from "@domain/optimizations"
import { Effect } from "effect"
import type { HydratedEvaluationAlignmentExample } from "../../alignment/types.ts"
import { executeEvaluationScriptWithAI } from "../../runtime/evaluation-execution.ts"

// TODO(eval-sandbox): when sandbox is available, executeEvaluationScript will run arbitrary JS
// and this function's structure will remain the same — it just calls executeEvaluationScript.
export const evaluateOptimizationCandidate = (input: {
  readonly candidate: OptimizationCandidate
  readonly example: HydratedEvaluationAlignmentExample
  readonly issueName: string
  readonly issueDescription: string
}) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("evaluation.candidateHash", input.candidate.hash)
    yield* Effect.annotateCurrentSpan("evaluation.exampleTraceId", input.example.traceId)

    const execution = yield* executeEvaluationScriptWithAI({
      script: input.candidate.text,
      conversation: input.example.conversation,
      issue: {
        name: input.issueName,
        description: input.issueDescription,
      },
    })

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
  }).pipe(Effect.withSpan("evaluations.evaluateOptimizationCandidate"))
