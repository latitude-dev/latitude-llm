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
import { ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import {
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

export const checkEligibility = (input: CheckEligibilityInput): Promise<true> =>
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

export const createOrAssignIssue = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly matchedIssueId: string | null
}): Promise<AssignmentResult> => Effect.runPromise(createOrAssignIssueUseCase(input))

export const syncProjections = (input: { readonly organizationId: string; readonly issueId: string }): Promise<void> =>
  Effect.runPromise(syncProjectionsUseCase(input))
