import { hashOptimizationCandidateText } from "@domain/optimizations"
import { Effect } from "effect"
import { generateBaselinePromptText } from "../../alignment/baseline-prompt.ts"
import type { GeneratedEvaluationDraft } from "../../alignment/types.ts"
import { defaultEvaluationTrigger } from "../../entities/evaluation.ts"
import { wrapPromptAsEvaluationScript } from "../../runtime/evaluation-execution.ts"

// TODO(eval-sandbox): restore LLM-based baseline generation for arbitrary scripts when sandbox
// is available.
export const generateBaselineDraftUseCase = (input: {
  readonly issueName: string
  readonly issueDescription: string
}) =>
  Effect.gen(function* () {
    const promptText = generateBaselinePromptText(input.issueName, input.issueDescription)
    const script = wrapPromptAsEvaluationScript(promptText)

    return {
      script,
      evaluationHash: yield* Effect.tryPromise(() => hashOptimizationCandidateText(script)),
      trigger: defaultEvaluationTrigger(),
    } satisfies GeneratedEvaluationDraft
  }).pipe(Effect.withSpan("evaluations.generateBaselineDraft"))
