import {
  type AssignmentResult,
  type CheckEligibilityError,
  type CheckEligibilityInput,
  checkEligibilityUseCase,
  createOrAssignIssueUseCase,
  DraftScoreNotEligibleForDiscoveryError,
  ErroredScoreNotEligibleForDiscoveryError,
  MissingScoreFeedbackForDiscoveryError,
  PassedScoreNotEligibleForDiscoveryError,
  type RetrievalResult,
  type RetrieveAndRerankInput,
  retrieveAndRerankUseCase,
  ScoreAlreadyOwnedByIssueError,
  ScoreDiscoveryOrganizationMismatchError,
  ScoreDiscoveryProjectMismatchError,
  ScoreNotFoundForDiscoveryError,
  syncProjectionsUseCase,
} from "@domain/issues"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

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

export const retrieveAndRerank = (input: RetrieveAndRerankInput): Promise<RetrievalResult> =>
  Effect.runPromise(retrieveAndRerankUseCase(input))

export const createOrAssignIssue = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly matchedIssueId: string | null
}): Promise<AssignmentResult> => Effect.runPromise(createOrAssignIssueUseCase(input))

export const syncProjections = (input: { readonly organizationId: string; readonly issueId: string }): Promise<void> =>
  Effect.runPromise(syncProjectionsUseCase(input))
