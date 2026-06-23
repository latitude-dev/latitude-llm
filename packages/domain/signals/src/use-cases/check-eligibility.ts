import { EvaluationRepository } from "@domain/evaluations"
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
  ScoreAlreadyOwnedBySignalError,
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
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const scoreRepository = yield* ScoreRepository

    const score = yield* scoreRepository
      .findById(ScoreId(input.scoreId))
      .pipe(
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

    if (score.signalId !== null) {
      return yield* new ScoreAlreadyOwnedBySignalError({ scoreId: input.scoreId })
    }

    if (score.feedback.trim().length === 0) {
      return yield* new MissingScoreFeedbackForDiscoveryError({ scoreId: input.scoreId })
    }

    if (score.sourceType === "evaluation") {
      const evaluationRepository = yield* EvaluationRepository
      const evaluation = yield* evaluationRepository
        .findById(score.sourceId)
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      const present =
        evaluation === null
          ? score.passed === false
          : evaluation.membershipOnPass
            ? score.passed === true
            : score.passed === false
      if (!present) {
        return yield* new PassedScoreNotEligibleForDiscoveryError({ scoreId: input.scoreId })
      }
    } else if (score.passed) {
      return yield* new PassedScoreNotEligibleForDiscoveryError({ scoreId: input.scoreId })
    }

    return score
  }).pipe(Effect.withSpan("issues.checkEligibility")) as Effect.Effect<
    Score,
    CheckEligibilityError | RepositoryError,
    ScoreRepository | EvaluationRepository
  >
