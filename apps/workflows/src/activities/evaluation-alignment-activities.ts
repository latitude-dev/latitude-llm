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
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive } from "@platform/ai-voyage"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  EvaluationAlignmentExamplesRepositoryLive,
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

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
