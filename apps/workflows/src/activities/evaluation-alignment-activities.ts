import { authorizeBillableAction, buildBillingIdempotencyKey } from "@domain/billing"
import {
  type BaselineEvaluationResult,
  type CollectedEvaluationAlignmentExamples,
  collectAlignmentExamplesUseCase,
  evaluateBaselineDraftUseCase,
  evaluateIncrementalDraftUseCase,
  type GeneratedEvaluationDraft,
  generateBaselineDraftUseCase,
  type HydratedEvaluationAlignmentExample,
  type IncrementalEvaluationRefreshResult,
  type LoadAlignmentStateOrInactiveResult,
  type LoadedEvaluationAlignmentState,
  loadAlignmentStateOrInactiveUseCase,
  loadAlignmentStateUseCase,
  type PersistEvaluationAlignmentResult,
  persistAlignmentResultUseCase,
} from "@domain/evaluations"
import { OrganizationId } from "@domain/shared"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import { RedisBillingSpendReservationLive } from "@platform/cache-redis"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  EvaluationAlignmentExamplesRepositoryLive,
  EvaluationRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  SignalRepositoryLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { QuickJsScriptRuntimeLive } from "@platform/sandbox-quickjs"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { withActivityAIMetering } from "./ai-metering.ts"

const logger = createLogger("workflows-evaluation-alignment")

class EvaluationAlignmentActivityError extends Data.TaggedError("EvaluationAlignmentActivityError")<{
  readonly activity: string
  readonly cause: unknown
}> {
  readonly httpStatus = 500

  get httpMessage() {
    return `Evaluation alignment activity "${this.activity}" failed`
  }
}

const evaluationAlignmentRepositoriesLive = Layer.mergeAll(
  EvaluationRepositoryLive,
  EvaluationAlignmentExamplesRepositoryLive,
  SignalRepositoryLive,
)

const evaluationGenerationBillingRepositoriesLive = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

export const loadEvaluationAlignmentState = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly evaluationId: string
}): Promise<LoadedEvaluationAlignmentState> =>
  Effect.runPromise(
    loadAlignmentStateUseCase(input).pipe(
      withPostgres(evaluationAlignmentRepositoriesLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withTracing,
    ),
  )

// Like `loadEvaluationAlignmentState`, but returns `{ status: "inactive" }`
// instead of failing when the evaluation is missing/archived/deleted/mismatched.
// Used by the throttled auto-alignment workflows so a delayed BullMQ job
// that fires after an evaluation has been archived exits cleanly.
export const loadEvaluationAlignmentStateOrInactive = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly evaluationId: string
}): Promise<LoadAlignmentStateOrInactiveResult> =>
  Effect.runPromise(
    loadAlignmentStateOrInactiveUseCase(input).pipe(
      withPostgres(evaluationAlignmentRepositoriesLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withTracing,
    ),
  )

export const collectEvaluationAlignmentExamples = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly createdAfter?: string | null
  readonly requirePositiveExamples?: boolean
}): Promise<CollectedEvaluationAlignmentExamples> =>
  Effect.runPromise(
    collectAlignmentExamplesUseCase(input).pipe(
      withPostgres(evaluationAlignmentRepositoriesLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withClickHouse(TraceRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      withAi(AIEmbedLive, getRedisClient()),
      withTracing,
    ),
  )

const buildEvaluationGenerationIdempotencyKey = (input: {
  readonly organizationId: string
  readonly billingOperationId: string
}) => buildBillingIdempotencyKey("llm-call", [input.organizationId, input.billingOperationId, "authorize"])

const authorizeEvaluationGenerationBillingEffect = Effect.fn("workflows.authorizeEvaluationGenerationBilling")(
  function* (input: {
    readonly organizationId: string
    readonly projectId: string
    readonly evaluationId: string | null
    readonly billingOperationId: string
  }) {
    const idempotencyKey = buildEvaluationGenerationIdempotencyKey(input)
    const authorization = yield* authorizeBillableAction({
      organizationId: OrganizationId(input.organizationId),
      action: "llm-call",
      skipIfBlocked: true,
      idempotencyKey,
    })

    return authorization.allowed
  },
)

export const authorizeEvaluationGenerationBilling = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string | null
  readonly billingOperationId: string
}): Promise<boolean> =>
  Effect.runPromise(
    authorizeEvaluationGenerationBillingEffect(input).pipe(
      withPostgres(
        evaluationGenerationBillingRepositoriesLive,
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      withTracing,
      Effect.tap((result) =>
        result
          ? Effect.void
          : Effect.sync(() =>
              logger.info("Evaluation generation blocked — billing limit reached", {
                organizationId: input.organizationId,
                projectId: input.projectId,
                evaluationId: input.evaluationId,
                billingOperationId: input.billingOperationId,
              }),
            ),
      ),
    ),
  )

/**
 * No-op kept for workflow replay determinism: usage is now recorded per LLM call by the
 * AI metering scope inside the activities that execute the work. Remove together with
 * its workflow call sites behind `patched()` once in-flight runs have drained.
 */
export const recordEvaluationGenerationUsage = (_input: {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string | null
  readonly billingOperationId: string
}): Promise<boolean> => Promise.resolve(true)

export const generateBaselineEvaluationDraft = (input: {
  readonly jobId: string
  readonly signalName: string
  readonly signalDescription: string
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}): Promise<GeneratedEvaluationDraft> =>
  Effect.runPromise(
    generateBaselineDraftUseCase(input).pipe(
      withTracing,
      Effect.mapError(
        (cause) =>
          new EvaluationAlignmentActivityError({
            activity: "generateBaselineEvaluationDraft",
            cause,
          }),
      ),
    ),
  )

export const evaluateBaselineEvaluationDraft = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly evaluationId: string | null
  readonly jobId: string
  readonly signalName: string
  readonly signalDescription: string
  readonly draft: GeneratedEvaluationDraft
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}): Promise<BaselineEvaluationResult> =>
  Effect.runPromise(
    evaluateBaselineDraftUseCase({
      signalName: input.signalName,
      signalDescription: input.signalDescription,
      script: input.draft.script,
      positiveExamples: input.positiveExamples,
      negativeExamples: input.negativeExamples,
      judgeTelemetry: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        signalId: input.signalId,
        evaluationId: input.evaluationId,
        jobId: input.jobId,
      },
    }).pipe(
      withActivityAIMetering({
        organizationId: input.organizationId,
        projectId: input.projectId,
        label: "eval-align-baseline",
      }),
      withAi(AIGenerateLive, getRedisClient()),
      Effect.provide(QuickJsScriptRuntimeLive),
      withPostgres(
        evaluationGenerationBillingRepositoriesLive,
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      withTracing,
      Effect.mapError(
        (cause) =>
          new EvaluationAlignmentActivityError({
            activity: "evaluateBaselineEvaluationDraft",
            cause,
          }),
      ),
    ),
  )

export const evaluateIncrementalEvaluationDraft = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly evaluationId: string | null
  readonly jobId?: string | null
  readonly signalName: string
  readonly signalDescription: string
  readonly draft: GeneratedEvaluationDraft
  readonly previousConfusionMatrix: Parameters<typeof evaluateIncrementalDraftUseCase>[0]["previousConfusionMatrix"]
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}): Promise<IncrementalEvaluationRefreshResult> =>
  Effect.runPromise(
    evaluateIncrementalDraftUseCase({
      signalName: input.signalName,
      signalDescription: input.signalDescription,
      draft: input.draft,
      previousConfusionMatrix: input.previousConfusionMatrix,
      positiveExamples: input.positiveExamples,
      negativeExamples: input.negativeExamples,
      judgeTelemetry: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        signalId: input.signalId,
        evaluationId: input.evaluationId,
        ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
      },
    }).pipe(
      withActivityAIMetering({
        organizationId: input.organizationId,
        projectId: input.projectId,
        label: "eval-align-incremental",
      }),
      withAi(AIGenerateLive, getRedisClient()),
      Effect.provide(QuickJsScriptRuntimeLive),
      withPostgres(
        evaluationGenerationBillingRepositoriesLive,
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      withTracing,
      Effect.mapError(
        (cause) =>
          new EvaluationAlignmentActivityError({
            activity: "evaluateIncrementalEvaluationDraft",
            cause,
          }),
      ),
    ),
  )

export const persistEvaluationAlignmentResult = (
  input: Parameters<typeof persistAlignmentResultUseCase>[0],
): Promise<PersistEvaluationAlignmentResult> =>
  Effect.runPromise(
    persistAlignmentResultUseCase(input).pipe(
      withPostgres(evaluationAlignmentRepositoriesLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withTracing,
    ),
  )
