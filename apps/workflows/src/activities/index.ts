import {
  type AssignmentResult,
  type CheckEligibilityError,
  type CheckEligibilityInput,
  type CreateOrAssignIssueInput,
  checkEligibilityUseCase,
  createOrAssignIssueUseCase,
  DraftScoreNotEligibleForDiscoveryError,
  type EmbeddedScoreFeedback,
  type EmbedScoreFeedbackInput,
  ErroredScoreNotEligibleForDiscoveryError,
  embedScoreFeedbackUseCase,
  type HybridSearchIssuesInput,
  type HybridSearchIssuesResult,
  hybridSearchIssuesUseCase,
  MissingScoreFeedbackForDiscoveryError,
  PassedScoreNotEligibleForDiscoveryError,
  type RerankIssueCandidatesInput,
  type RetrievalResult,
  rerankIssueCandidatesUseCase,
  ScoreAlreadyOwnedByIssueError,
  ScoreDiscoveryOrganizationMismatchError,
  ScoreDiscoveryProjectMismatchError,
  ScoreNotFoundForDiscoveryError,
  type SyncIssueProjectionsInput,
  syncIssueProjectionsUseCase,
} from "@domain/issues"
import { syncScoreAnalyticsUseCase } from "@domain/scores"
import { OrganizationId } from "@domain/shared"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { IssueRepositoryLive, OutboxEventWriterLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import {
  getClickhouseClient,
  getIssueDiscoveryAiLayerEffect,
  getIssueProjectionRepositoryLayerEffect,
  getPostgresClient,
} from "../clients.ts"

const logger = createLogger("workflows-issue-discovery")

const eligibilityErrorConstructors = [
  ScoreNotFoundForDiscoveryError,
  ScoreDiscoveryOrganizationMismatchError,
  ScoreDiscoveryProjectMismatchError,
  DraftScoreNotEligibleForDiscoveryError,
  ErroredScoreNotEligibleForDiscoveryError,
  ScoreAlreadyOwnedByIssueError,
  MissingScoreFeedbackForDiscoveryError,
  PassedScoreNotEligibleForDiscoveryError,
] as const

const isEligibilityError = (error: unknown): error is CheckEligibilityError => {
  return eligibilityErrorConstructors.some((Ctor) => error instanceof Ctor)
}

export const checkEligibility = (input: CheckEligibilityInput) =>
  Effect.runPromise(
    checkEligibilityUseCase(input).pipe(
      withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (isEligibilityError(error)) {
            return
          }

          logger.error("Issue discovery eligibility check failed", {
            scoreId: input.scoreId,
            error,
          })
        }),
      ),
    ),
  )

export const embedScoreFeedback = (input: EmbedScoreFeedbackInput): Promise<EmbeddedScoreFeedback> =>
  Effect.runPromise(
    getIssueDiscoveryAiLayerEffect().pipe(
      Effect.flatMap((issueDiscoveryAiLayer) =>
        embedScoreFeedbackUseCase(input).pipe(
          withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
          Effect.provide(issueDiscoveryAiLayer),
        ),
      ),
    ),
  )

export const hybridSearchIssues = (input: HybridSearchIssuesInput): Promise<HybridSearchIssuesResult> =>
  Effect.runPromise(
    getIssueProjectionRepositoryLayerEffect().pipe(
      Effect.flatMap((issueProjectionRepositoryLayer) =>
        hybridSearchIssuesUseCase(input).pipe(Effect.provide(issueProjectionRepositoryLayer)),
      ),
    ),
  )

export const rerankIssueCandidates = (input: RerankIssueCandidatesInput): Promise<RetrievalResult> =>
  Effect.runPromise(
    getIssueDiscoveryAiLayerEffect().pipe(
      Effect.flatMap((issueDiscoveryAiLayer) =>
        rerankIssueCandidatesUseCase(input).pipe(Effect.provide(issueDiscoveryAiLayer)),
      ),
    ),
  )

export const createOrAssignIssue = (input: CreateOrAssignIssueInput): Promise<AssignmentResult> =>
  Effect.runPromise(
    createOrAssignIssueUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, IssueRepositoryLive, OutboxEventWriterLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
    ),
  )

export interface SyncScoreAnalyticsActivityInput {
  readonly organizationId: string
  readonly scoreId: string
}

export const syncScoreAnalytics = (input: SyncScoreAnalyticsActivityInput): Promise<void> =>
  Effect.runPromise(
    syncScoreAnalyticsUseCase({ scoreId: input.scoreId }).pipe(
      withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
    ),
  )

export const syncIssueProjections = (input: SyncIssueProjectionsInput): Promise<void> =>
  Effect.runPromise(
    getIssueProjectionRepositoryLayerEffect().pipe(
      Effect.flatMap((issueProjectionRepositoryLayer) =>
        syncIssueProjectionsUseCase(input).pipe(
          withPostgres(IssueRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
          Effect.provide(issueProjectionRepositoryLayer),
        ),
      ),
    ),
  )
