import { OutboxEventWriter } from "@domain/events"
import { type Score, ScoreRepository } from "@domain/scores"
import { type CacheError, ProjectId, type RepositoryError, ScoreId, SignalId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SIGNAL_UPDATE_LOCK_KEY, SIGNAL_UPDATE_LOCK_TTL_SECONDS } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import type { CheckEligibilityError, SignalDiscoveryLockUnavailableError } from "../errors.ts"
import { ScoreAlreadyOwnedBySignalError, SignalNotFoundForAssignmentError } from "../errors.ts"
import { updateSignalCentroid } from "../helpers.ts"
import { withSignalDiscoveryLock } from "../locks.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"

export interface AssignScoreToSignalInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly signalId: string
  readonly normalizedEmbedding: readonly number[]
}

export type AssignScoreToSignalResult = {
  readonly signalId: string
  readonly action: "assigned" | "already-assigned"
}

export type AssignScoreToSignalError =
  | CacheError
  | CheckEligibilityError
  | SignalDiscoveryLockUnavailableError
  | SignalNotFoundForAssignmentError
  | RepositoryError
  | ScoreAlreadyOwnedBySignalError

type LoadedEligibleScoreResult =
  | {
      readonly action: "ready"
      readonly score: Score
    }
  | {
      readonly action: "already-assigned"
      readonly signalId: string
    }

const loadEligibleScoreOrCurrentOwner = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
}) =>
  checkEligibilityUseCase(input).pipe(
    Effect.map((score) => ({ action: "ready", score }) satisfies LoadedEligibleScoreResult),
    Effect.catchTag("ScoreAlreadyOwnedBySignalError", () =>
      Effect.gen(function* () {
        const scoreRepository = yield* ScoreRepository
        const currentScore = yield* scoreRepository
          .findById(ScoreId(input.scoreId))
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        const existingSignalId = currentScore?.signalId

        if (existingSignalId != null) {
          return {
            action: "already-assigned",
            signalId: existingSignalId,
          } satisfies LoadedEligibleScoreResult
        }

        return yield* new ScoreAlreadyOwnedBySignalError({ scoreId: input.scoreId })
      }),
    ),
  )

const buildSignalWithAssignedScore = ({
  issue,
  score,
  normalizedEmbedding,
  assignedAt,
}: {
  readonly issue: Signal
  readonly score: Score
  readonly normalizedEmbedding: readonly number[]
  readonly assignedAt: Date
}): Signal => {
  if (issue.centroid === null) {
    return { ...issue, updatedAt: assignedAt }
  }
  const centroid = updateSignalCentroid({
    centroid: {
      ...issue.centroid,
      clusteredAt: issue.clusteredAt ?? assignedAt,
    },
    score: {
      embedding: normalizedEmbedding,
      sourceType: score.sourceType,
      createdAt: score.createdAt,
    },
    operation: "add",
    timestamp: assignedAt,
  })

  return {
    ...issue,
    centroid,
    clusteredAt: centroid.clusteredAt,
    updatedAt: assignedAt,
  }
}

export const assignScoreToSignalUseCase = (input: AssignScoreToSignalInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const sqlClient = yield* SqlClient
    const scoreResult = yield* loadEligibleScoreOrCurrentOwner(input)

    if (scoreResult.action === "already-assigned") {
      return {
        action: "already-assigned",
        signalId: scoreResult.signalId,
      } satisfies AssignScoreToSignalResult
    }

    const score = scoreResult.score

    return yield* withSignalDiscoveryLock(
      {
        organizationId: input.organizationId,
        projectId: ProjectId(input.projectId),
        lockKey: SIGNAL_UPDATE_LOCK_KEY(input.signalId),
        ttlSeconds: SIGNAL_UPDATE_LOCK_TTL_SECONDS,
      },
      Effect.gen(function* () {
        const assignment = yield* sqlClient.transaction(
          Effect.gen(function* () {
            const signalRepository = yield* SignalRepository
            const outboxEventWriter = yield* OutboxEventWriter
            const scoreRepository = yield* ScoreRepository
            const issue = yield* signalRepository
              .findByIdForUpdate(SignalId(input.signalId))
              .pipe(
                Effect.catchTag("NotFoundError", () =>
                  Effect.fail(new SignalNotFoundForAssignmentError({ signalId: input.signalId })),
                ),
              )

            if (issue.projectId !== score.projectId) {
              return yield* new SignalNotFoundForAssignmentError({ signalId: input.signalId })
            }

            const assignedAt = new Date()
            // Reopen-on-occurrence, reified at write time: clearing `resolvedAt`
            // under the row lock makes the regression a stored fact, so a later
            // score in the same cycle sees `resolvedAt === null` and cannot
            // re-emit. The `createdAt > resolvedAt` guard keeps replayed
            // historical scores from reopening; ignored signals never regress.
            const isRegression =
              issue.ignoredAt === null &&
              issue.resolvedAt !== null &&
              score.createdAt.getTime() > issue.resolvedAt.getTime()
            const updatedSignal = buildSignalWithAssignedScore({
              issue: isRegression ? { ...issue, resolvedAt: null, regressedAt: assignedAt } : issue,
              score,
              normalizedEmbedding: input.normalizedEmbedding,
              assignedAt,
            })

            const claimed = yield* scoreRepository.assignSignalIfUnowned({
              scoreId: score.id,
              signalId: issue.id,
              updatedAt: assignedAt,
            })

            if (!claimed) {
              const currentScore = yield* scoreRepository
                .findById(score.id)
                .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
              if (currentScore && currentScore.signalId !== null) {
                return {
                  action: "already-assigned",
                  signalId: currentScore.signalId,
                } satisfies AssignScoreToSignalResult
              }

              return yield* new ScoreAlreadyOwnedBySignalError({ scoreId: score.id })
            }

            yield* signalRepository.save(updatedSignal)
            yield* outboxEventWriter.write({
              eventName: "ScoreAssignedToSignal",
              aggregateType: "score",
              aggregateId: score.id,
              organizationId: score.organizationId,
              payload: {
                organizationId: score.organizationId,
                projectId: score.projectId,
                signalId: issue.id,
              },
            })

            if (isRegression) {
              yield* outboxEventWriter.write({
                eventName: "SignalRegressed",
                aggregateType: "issue",
                aggregateId: issue.id,
                organizationId: issue.organizationId,
                payload: {
                  organizationId: issue.organizationId,
                  projectId: issue.projectId,
                  signalId: issue.id,
                  regressedAt: assignedAt.toISOString(),
                  triggerScoreId: score.id,
                },
              })
            }

            return {
              action: "assigned",
              signalId: issue.id,
            } satisfies AssignScoreToSignalResult
          }),
        )

        return assignment
      }),
    )
  }).pipe(Effect.withSpan("issues.assignScoreToSignal")) as Effect.Effect<
    AssignScoreToSignalResult,
    AssignScoreToSignalError
  >
