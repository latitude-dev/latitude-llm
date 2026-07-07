import { AI, resolveGenerationConfig } from "@domain/ai"
import { AIMeteringScope, type AIMeteringScopeShape, provideAIMeteringScope } from "@domain/billing"
import {
  ALIGNMENT_CURATED_DATASET_MAX_ROWS,
  ALIGNMENT_DEFAULT_SEED,
  ALIGNMENT_TRAIN_SPLIT,
  ALIGNMENT_VALIDATION_SPLIT,
  buildEvaluationGepaProposeTelemetryCapture,
  evaluateOptimizationCandidate,
  type GeneratedEvaluationDraft,
  type HydratedEvaluationAlignmentExample,
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
import { OrganizationId } from "@domain/shared"
import { AIGenerateLive, withAi } from "@platform/ai"
import { RedisBillingSpendReservationLive } from "@platform/cache-redis"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import {
  buildGepaProposalPrompt,
  GEPA_DEFAULT_PROPOSER_MODEL,
  GEPA_DEFAULT_REFLECTION_SIZE,
  GEPA_PROPOSER_SYSTEM_PROMPT,
  GepaOptimizerLive,
  gepaProposalOutputSchema,
} from "@platform/op-gepa"
import { QuickJsScriptRuntimeLive } from "@platform/sandbox-quickjs"
import { withTracing } from "@repo/observability"
import { Data, Effect, Layer, Option } from "effect"
import { getPostgresClient, getRedisClient } from "../clients.ts"
import { withActivityAIMetering } from "./ai-metering.ts"

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
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly evaluationId: string | null
  readonly jobId: string
  readonly draftEvaluationHash: string
  readonly candidate: OptimizationCandidate
  readonly signalName: string
  readonly signalDescription: string
  readonly context: readonly OptimizationTrajectory[]
  /** Carried explicitly: this runs in its own Effect runtime, outside the activity's ambient context. */
  readonly meteringScope: AIMeteringScopeShape | undefined
}): Promise<OptimizationCandidate> =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("projectId", input.projectId)
      yield* Effect.annotateCurrentSpan("signalId", input.signalId)
      yield* Effect.annotateCurrentSpan("jobId", input.jobId)
      yield* Effect.annotateCurrentSpan("evaluation.candidateHash", input.candidate.hash)

      const ai = yield* AI
      const modelConfig = yield* resolveGenerationConfig("GEPA_PROPOSER", GEPA_DEFAULT_PROPOSER_MODEL)
      const result = yield* ai.generate({
        ...modelConfig,
        telemetry: buildEvaluationGepaProposeTelemetryCapture({
          organizationId: input.organizationId,
          projectId: input.projectId,
          signalId: input.signalId,
          evaluationId: input.evaluationId,
          jobId: input.jobId,
          evaluationHash: input.draftEvaluationHash,
          candidateHash: input.candidate.hash,
        }),
        system: GEPA_PROPOSER_SYSTEM_PROMPT,
        prompt: buildGepaProposalPrompt({
          signalName: input.signalName,
          signalDescription: input.signalDescription,
          currentScript: input.candidate.text,
          trajectories: input.context,
        }),
        schema: gepaProposalOutputSchema,
      })

      const script = result.object.script.trim()

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
      (effect) => (input.meteringScope ? provideAIMeteringScope(input.meteringScope)(effect) : effect),
      withAi(AIGenerateLive, getRedisClient()),
      withTracing,
      Effect.withSpan("evaluations.proposeOptimizationCandidate"),
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
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly evaluationId: string | null
  readonly jobId: string
  readonly draft: GeneratedEvaluationDraft
  readonly signalName: string
  readonly signalDescription: string
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}): Promise<GeneratedEvaluationDraft> =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("projectId", input.projectId)
      yield* Effect.annotateCurrentSpan("signalId", input.signalId)
      yield* Effect.annotateCurrentSpan("jobId", input.jobId)
      yield* Effect.annotateCurrentSpan("alignment.positiveExampleCount", input.positiveExamples.length)
      yield* Effect.annotateCurrentSpan("alignment.negativeExampleCount", input.negativeExamples.length)

      const optimizer = yield* Optimizer
      const services = yield* Effect.context<never>()
      // Provided by `withActivityAIMetering` below; carried by value into the `propose`
      // callback, which runs in its own Effect runtime.
      const meteringScope = Option.getOrUndefined(yield* Effect.serviceOption(AIMeteringScope))
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

      if (dataset.valset.length === 0) {
        return yield* Effect.fail(
          new Error(
            `GEPA optimization requires separate training and validation examples, got ${allExamples.length} curated example${allExamples.length === 1 ? "" : "s"}`,
          ),
        )
      }

      // Stagnation budget sized so the proposer sees at least every curated
      // dataset row before we declare the search exhausted, regardless of how
      // the minibatch size is configured. Floored at 10 to keep the engine
      // from giving up on tiny clusters where the math collapses.
      const reflectionSize = GEPA_DEFAULT_REFLECTION_SIZE
      const stagnation = Math.max(10, Math.ceil(ALIGNMENT_CURATED_DATASET_MAX_ROWS / reflectionSize))

      const optimized = yield* optimizer.optimize({
        baselineCandidate: {
          componentId: OPTIMIZATION_COMPONENT_ID,
          text: input.draft.script,
          hash: input.draft.evaluationHash,
        },
        dataset,
        reflectionSize,
        budget: {
          stagnation,
        },
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
              signalName: input.signalName,
              signalDescription: input.signalDescription,
              judgeTelemetry: {
                organizationId: input.organizationId,
                projectId: input.projectId,
                signalId: input.signalId,
                evaluationId: input.evaluationId,
                jobId: input.jobId,
              },
            }).pipe(
              withAi(AIGenerateLive, getRedisClient()),
              Effect.provide(QuickJsScriptRuntimeLive),
              withTracing,
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
            organizationId: input.organizationId,
            projectId: input.projectId,
            signalId: input.signalId,
            evaluationId: input.evaluationId,
            jobId: input.jobId,
            draftEvaluationHash: input.draft.evaluationHash,
            candidate,
            signalName: input.signalName,
            signalDescription: input.signalDescription,
            context,
            meteringScope,
          }),
      })

      yield* Effect.annotateCurrentSpan("optimization.stopReason", optimized.stopReason)
      yield* Effect.annotateCurrentSpan("optimization.optimizedCandidateHash", optimized.optimizedCandidate.hash)

      return {
        ...input.draft,
        script: optimized.optimizedCandidate.text,
        evaluationHash: optimized.optimizedCandidate.hash,
      }
    }).pipe(
      withActivityAIMetering({
        organizationId: input.organizationId,
        projectId: input.projectId,
        label: "eval-optimize",
      }),
      withPostgres(
        Layer.mergeAll(
          BillingOverrideRepositoryLive,
          BillingUsageEventRepositoryLive,
          BillingUsagePeriodRepositoryLive,
          OutboxEventWriterLive,
          SettingsReaderLive,
          StripeSubscriptionLookupLive,
        ),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      Effect.provide(GepaOptimizerLive),
      withTracing,
      Effect.withSpan("evaluations.optimizeEvaluationDraft"),
      Effect.mapError((cause) =>
        cause instanceof EvaluationOptimizationActivityError
          ? cause
          : new EvaluationOptimizationActivityError({
              activity: "optimizeEvaluationDraft",
              cause,
            }),
      ),
    ),
  )
