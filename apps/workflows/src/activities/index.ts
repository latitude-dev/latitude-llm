import {
  type AssignmentResult,
  type CheckEligibilityError,
  type CheckEligibilityInput,
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
  syncProjectionsUseCase,
} from "@domain/issues"
import { OrganizationId } from "@domain/shared"
import { AIVoyageLive, createVoyageClientEffect } from "@platform/ai-voyage"
import { createRedisClient, createRedisConnection, RedisCacheStoreLive } from "@platform/cache-redis"
import { createPostgresClient, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createWeaviateClientEffect, IssueProjectionRepositoryLive } from "@platform/db-weaviate"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"

const logger = createLogger("workflows-issue-discovery")
const postgresClient = createPostgresClient()
const redisClient = createRedisClient(createRedisConnection())
const issueDiscoveryAiLayerEffect = createVoyageClientEffect().pipe(
  Effect.map((voyageClient) => AIVoyageLive(voyageClient).pipe(Layer.provideMerge(RedisCacheStoreLive(redisClient)))),
)
const issueProjectionRepositoryLayerEffect = createWeaviateClientEffect().pipe(
  Effect.map((weaviateClient) => IssueProjectionRepositoryLive(weaviateClient)),
)

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

export const checkEligibility = (input: CheckEligibilityInput): Promise<true> =>
  Effect.runPromise(
    checkEligibilityUseCase(input).pipe(
      withPostgres(ScoreRepositoryLive, postgresClient, OrganizationId(input.organizationId)),
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
    issueDiscoveryAiLayerEffect.pipe(
      Effect.flatMap((issueDiscoveryAiLayer) =>
        embedScoreFeedbackUseCase(input).pipe(
          withPostgres(ScoreRepositoryLive, postgresClient, OrganizationId(input.organizationId)),
          Effect.provide(issueDiscoveryAiLayer),
        ),
      ),
    ),
  )

export const hybridSearchIssues = (input: HybridSearchIssuesInput): Promise<HybridSearchIssuesResult> =>
  Effect.runPromise(
    issueProjectionRepositoryLayerEffect.pipe(
      Effect.flatMap((issueProjectionRepositoryLayer) =>
        hybridSearchIssuesUseCase(input).pipe(Effect.provide(issueProjectionRepositoryLayer)),
      ),
    ),
  )

export const rerankIssueCandidates = (input: RerankIssueCandidatesInput): Promise<RetrievalResult> =>
  Effect.runPromise(
    issueDiscoveryAiLayerEffect.pipe(
      Effect.flatMap((issueDiscoveryAiLayer) =>
        rerankIssueCandidatesUseCase(input).pipe(Effect.provide(issueDiscoveryAiLayer)),
      ),
    ),
  )

export const createOrAssignIssue = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly matchedIssueId: string | null
}): Promise<AssignmentResult> => Effect.runPromise(createOrAssignIssueUseCase(input))

export const syncProjections = (input: { readonly organizationId: string; readonly issueId: string }): Promise<void> =>
  Effect.runPromise(syncProjectionsUseCase(input))
