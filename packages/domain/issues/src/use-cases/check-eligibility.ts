import { type Score, ScoreRepository } from "@domain/scores"
import type { RepositoryError } from "@domain/shared"
import { ScoreId } from "@domain/shared"
import { Effect } from "effect"
import {
  type CheckEligibilityError,
  DraftScoreNotEligibleForDiscoveryError,
  ErroredScoreNotEligibleForDiscoveryError,
  MissingScoreFeedbackForDiscoveryError,
  PassedScoreNotEligibleForDiscoveryError,
  ScoreAlreadyOwnedByIssueError,
  ScoreDiscoveryOrganizationMismatchError,
  ScoreDiscoveryProjectMismatchError,
  ScoreNotFoundForDiscoveryError,
} from "../errors.ts"

export interface CheckEligibilityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
}

export const checkEligibilityUseCase = (input: CheckEligibilityInput) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository

    const score = yield* scoreRepository.findById(ScoreId(input.scoreId)).pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new ScoreNotFoundForDiscoveryError({ scoreId: input.scoreId })),
      ),
    )

    if (score.organizationId !== input.organizationId) {
      return yield* new ScoreDiscoveryOrganizationMismatchError({ scoreId: input.scoreId })
    }

    if (score.projectId !== input.projectId) {
      return yield* new ScoreDiscoveryProjectMismatchError({ scoreId: input.scoreId })
    }

    if (score.draftedAt !== null) {
      return yield* new DraftScoreNotEligibleForDiscoveryError({ scoreId: input.scoreId })
    }

    if (score.errored) {
      return yield* new ErroredScoreNotEligibleForDiscoveryError({ scoreId: input.scoreId })
    }

    if (score.issueId !== null) {
      return yield* new ScoreAlreadyOwnedByIssueError({ scoreId: input.scoreId })
    }

    if (score.feedback.trim().length === 0) {
      return yield* new MissingScoreFeedbackForDiscoveryError({ scoreId: input.scoreId })
    }

    if (score.passed) {
      return yield* new PassedScoreNotEligibleForDiscoveryError({ scoreId: input.scoreId })
    }

    return score
  }) as Effect.Effect<Score, CheckEligibilityError | RepositoryError>
