import { authorizeBillableAction, buildBillingIdempotencyKey, recordBillableActionUseCase } from "@domain/billing"
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
import { OrganizationId, ProjectId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive } from "@platform/ai-voyage"
import { RedisBillingSpendReservationLive } from "@platform/cache-redis"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  EvaluationAlignmentExamplesRepositoryLive,
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

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
  IssueRepositoryLive,
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
  readonly issueId: string
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
  readonly issueId: string
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
  readonly issueId: string
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
}) => buildBillingIdempotencyKey("eval-generation", [input.organizationId, input.billingOperationId])

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
      action: "eval-generation",
      skipIfBlocked: true,
      idempotencyKey,
    })

    return authorization.allowed
  },
)

const recordEvaluationGenerationUsageEffect = Effect.fn("workflows.recordEvaluationGenerationUsage")(function* (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string | null
  readonly billingOperationId: string
}) {
  const idempotencyKey = buildEvaluationGenerationIdempotencyKey(input)
  // Re-authorize so we have a fresh `AuthorizedBillableActionContext` to
  // pass to the recorder (the workflow cannot serialize `Date` objects
  // cleanly across activities, and the resolved plan is cached for 60s
  // anyway). The reservation is idempotent on `idempotencyKey`, so the
  // Redis counter is not incremented twice.
  const authorization = yield* authorizeBillableAction({
    organizationId: OrganizationId(input.organizationId),
    action: "eval-generation",
    skipIfBlocked: true,
    idempotencyKey,
  })

  if (!authorization.allowed) {
    // Spending cap was lowered or the plan changed between authorize and
    // record. Skip recording — work still happened, but persisting the
    // usage event would breach the cap. This is the rare case the cap
    // promise documents as a soft-overshoot.
    return false
  }

  yield* recordBillableActionUseCase({
    organizationId: OrganizationId(input.organizationId),
    projectId: ProjectId(input.projectId),
    action: "eval-generation",
    idempotencyKey,
    context: authorization.context,
    metadata: {
      evaluationId: input.evaluationId,
      billingOperationId: input.billingOperationId,
    },
  })

  return true
})

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

export const recordEvaluationGenerationUsage = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string | null
  readonly billingOperationId: string
}): Promise<boolean> =>
  Effect.runPromise(
    recordEvaluationGenerationUsageEffect(input).pipe(
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
              logger.warn("Evaluation generation usage not recorded — billing cap moved during run", {
                organizationId: input.organizationId,
                projectId: input.projectId,
                evaluationId: input.evaluationId,
                billingOperationId: input.billingOperationId,
              }),
            ),
      ),
    ),
  )

export const generateBaselineEvaluationDraft = (input: {
  readonly jobId: string
  readonly issueName: string
  readonly issueDescription: string
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
  readonly issueId: string
  readonly evaluationId: string | null
  readonly jobId: string
  readonly issueName: string
  readonly issueDescription: string
  readonly draft: GeneratedEvaluationDraft
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}): Promise<BaselineEvaluationResult> =>
  Effect.runPromise(
    evaluateBaselineDraftUseCase({
      issueName: input.issueName,
      issueDescription: input.issueDescription,
      script: input.draft.script,
      positiveExamples: input.positiveExamples,
      negativeExamples: input.negativeExamples,
      judgeTelemetry: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        evaluationId: input.evaluationId,
        jobId: input.jobId,
      },
    }).pipe(
      withAi(AIGenerateLive, getRedisClient()),
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
  readonly issueId: string
  readonly evaluationId: string | null
  readonly jobId?: string | null
  readonly issueName: string
  readonly issueDescription: string
  readonly draft: GeneratedEvaluationDraft
  readonly previousConfusionMatrix: Parameters<typeof evaluateIncrementalDraftUseCase>[0]["previousConfusionMatrix"]
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}): Promise<IncrementalEvaluationRefreshResult> =>
  Effect.runPromise(
    evaluateIncrementalDraftUseCase({
      issueName: input.issueName,
      issueDescription: input.issueDescription,
      draft: input.draft,
      previousConfusionMatrix: input.previousConfusionMatrix,
      positiveExamples: input.positiveExamples,
      negativeExamples: input.negativeExamples,
      judgeTelemetry: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        evaluationId: input.evaluationId,
        ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
      },
    }).pipe(
      withAi(AIGenerateLive, getRedisClient()),
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
