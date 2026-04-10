import { AI } from "@domain/ai"
import {
  ALIGNMENT_DEFAULT_SEED,
  ALIGNMENT_TRAIN_SPLIT,
  ALIGNMENT_VALIDATION_SPLIT,
  evaluateOptimizationCandidate,
  type GeneratedEvaluationDraft,
  type HydratedEvaluationAlignmentExample,
  validateEvaluationScript,
} from "@domain/evaluations"
import {
  hashOptimizationCandidateText,
  OPTIMIZATION_COMPONENT_ID,
  type OptimizationCandidate,
  type OptimizationTrajectory,
  type OptimizeEvaluationInput,
  type OptimizeProposalInput,
  Optimizer,
  splitOptimizationExamples,
} from "@domain/optimizations"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import {
  buildGepaProposalPrompt,
  GEPA_PROPOSER_MODEL,
  GEPA_PROPOSER_SYSTEM_PROMPT,
  GepaOptimizerLive,
  gepaProposalOutputSchema,
} from "@platform/op-gepa"
import { Data, Effect } from "effect"
import { getRedisClient } from "../clients.ts"

class EvaluationOptimizationActivityError extends Data.TaggedError("EvaluationAlignmentActivityError")<{
  readonly activity: string
  readonly cause: unknown
}> {
  readonly httpStatus = 500

  get httpMessage() {
    return `Evaluation alignment activity "${this.activity}" failed`
  }
}

const proposeOptimizationCandidate = (input: {
  readonly candidate: OptimizationCandidate
  readonly issueName: string
  readonly issueDescription: string
  readonly context: readonly OptimizationTrajectory[]
}): Promise<OptimizationCandidate> =>
  Effect.runPromise(
    Effect.gen(function* () {
      if (!validateEvaluationScript(input.candidate.text)) {
        return yield* new EvaluationOptimizationActivityError({
          activity: "optimizeEvaluationDraft",
          cause: new Error("Current candidate script does not match the expected LLM-as-judge template"),
        })
      }

      const ai = yield* AI
      const result = yield* ai.generate({
        ...GEPA_PROPOSER_MODEL,
        system: GEPA_PROPOSER_SYSTEM_PROMPT,
        prompt: buildGepaProposalPrompt({
          issueName: input.issueName,
          issueDescription: input.issueDescription,
          currentScript: input.candidate.text,
          trajectories: input.context,
        }),
        schema: gepaProposalOutputSchema,
      })

      const script = result.object.script.trim()

      if (!validateEvaluationScript(script)) {
        return yield* new EvaluationOptimizationActivityError({
          activity: "optimizeEvaluationDraft",
          cause: new Error("Proposed evaluation script failed template validation"),
        })
      }

      return {
        componentId: input.candidate.componentId,
        text: script,
        hash: yield* Effect.tryPromise({
          try: () => hashOptimizationCandidateText(script),
          catch: (cause) =>
            new EvaluationOptimizationActivityError({
              activity: "optimizeEvaluationDraft",
              cause,
            }),
        }),
      } satisfies OptimizationCandidate
    }).pipe(
      withAi(AIGenerateLive, getRedisClient()),
      Effect.mapError(
        (cause) =>
          new EvaluationOptimizationActivityError({
            activity: "optimizeEvaluationDraft",
            cause,
          }),
      ),
    ),
  )

export const optimizeEvaluationDraft = (input: {
  readonly draft: GeneratedEvaluationDraft
  readonly issueName: string
  readonly issueDescription: string
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}): Promise<GeneratedEvaluationDraft> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const optimizer = yield* Optimizer
      const services = yield* Effect.services<never>()
      const allExamples = [...input.positiveExamples, ...input.negativeExamples]
      const examplesById = new Map<string, HydratedEvaluationAlignmentExample>(
        allExamples.map((example) => [example.traceId as string, example]),
      )
      const dataset = splitOptimizationExamples({
        examples: allExamples.map((example) => ({
          id: example.traceId,
          label: example.label,
        })),
        seed: ALIGNMENT_DEFAULT_SEED,
        trainRatio: ALIGNMENT_TRAIN_SPLIT,
        validationRatio: ALIGNMENT_VALIDATION_SPLIT,
      })

      const optimized = yield* optimizer.optimize({
        baselineCandidate: {
          componentId: OPTIMIZATION_COMPONENT_ID,
          text: input.draft.script,
          hash: input.draft.evaluationHash,
        },
        dataset,
        evaluate: async ({ candidate, example }: OptimizeEvaluationInput) => {
          const hydratedExample = examplesById.get(example.id)
          if (!hydratedExample) {
            throw new EvaluationOptimizationActivityError({
              activity: "optimizeEvaluationDraft",
              cause: new Error(`Missing hydrated optimization example ${example.id}`),
            })
          }

          return Effect.runPromiseWith(services)(
            evaluateOptimizationCandidate({
              candidate,
              example: hydratedExample,
              issueName: input.issueName,
              issueDescription: input.issueDescription,
            }).pipe(
              withAi(AIGenerateLive, getRedisClient()),
              Effect.mapError(
                (cause) =>
                  new EvaluationOptimizationActivityError({
                    activity: "optimizeEvaluationDraft",
                    cause,
                  }),
              ),
            ),
          )
        },
        propose: ({ candidate, context }: OptimizeProposalInput) =>
          proposeOptimizationCandidate({
            candidate,
            issueName: input.issueName,
            issueDescription: input.issueDescription,
            context,
          }),
      })

      return {
        ...input.draft,
        script: optimized.optimizedCandidate.text,
        evaluationHash: optimized.optimizedCandidate.hash,
      }
    }).pipe(
      Effect.provide(GepaOptimizerLive),
      Effect.mapError(
        (cause) =>
          new EvaluationOptimizationActivityError({
            activity: "optimizeEvaluationDraft",
            cause,
          }),
      ),
    ),
  )
