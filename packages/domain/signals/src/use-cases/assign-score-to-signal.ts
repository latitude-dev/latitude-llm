import { OutboxEventWriter } from "@domain/events"
import { type Score, ScoreRepository } from "@domain/scores"
import {
  type CacheError,
  type CacheStore,
  type ChSqlClient,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  ScoreId,
  SignalId,
  SqlClient,
} from "@domain/shared"
import type { SessionRepository } from "@domain/spans"
import { Effect } from "effect"
import {
  PROMOTION_MIN_SESSIONS,
  PROMOTION_WINDOW_DAYS,
  SIGNAL_UPDATE_LOCK_KEY,
  SIGNAL_UPDATE_LOCK_TTL_SECONDS,
} from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import type { CheckEligibilityError, SignalDiscoveryLockUnavailableError } from "../errors.ts"
import { ScoreAlreadyOwnedBySignalError, SignalNotFoundForAssignmentError } from "../errors.ts"
import { updateSignalCentroid } from "../helpers.ts"
import { withSignalDiscoveryLock } from "../locks.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { promotionThreshold } from "../promotion.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"
import { resolveProjectSessionVolumeUseCase } from "./resolve-project-session-volume.ts"

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

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Distinct sessions this signal must reach to be promoted, resolved before the
 * transaction opens because it reads Redis and ClickHouse.
 *
 * Only called when an unlocked pre-read says the signal is still unpromoted, so
 * the cost is paid on the small minority of assignments that could change
 * anything. A degraded volume lookup falls back to the floor: an unavailable
 * cache makes promotion easier, never harder.
 */
const resolvePromotionThreshold = (input: AssignScoreToSignalInput) =>
  Effect.gen(function* () {
    const volume = yield* resolveProjectSessionVolumeUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
    })

    return {
      threshold: volume === null ? PROMOTION_MIN_SESSIONS : promotionThreshold(volume),
      volume,
    }
  })

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

    // Reads through the promotion gate on purpose: an unpromoted signal is
    // exactly the case this pre-read exists for, so a default-deny lookup would
    // report every candidate as already promoted and the latch would never fire.
    //
    // Resolved before the lock: promotion needs the project's session volume,
    // which lives in ClickHouse behind a Redis cache, and neither belongs inside
    // the Postgres transaction below. The extra unlocked read buys that
    // separation; it is a primary-key lookup against a path that already does
    // several. Promotion is a one-way latch, so this can only be stale in the
    // harmless direction — the transaction re-checks it under the row lock.
    const signals = yield* SignalRepository
    const unpromotedBeforeAssignment = yield* signals
      .findById(SignalId(input.signalId), { includeUnpromoted: true })
      .pipe(Effect.map((signal) => signal.promotedAt === null))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(false)))
    const promotion = unpromotedBeforeAssignment ? yield* resolvePromotionThreshold(input) : null

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

            // Promotion, in the one order that is cheap: the latch is re-checked
            // under the row lock before anything is counted, because a promoted
            // signal can hold hundreds of thousands of scores and
            // `scores_signal_lookup_idx` does not cover `session_id`. An
            // unpromoted signal holds at most the threshold, so counting it is
            // trivial. Counted after the claim so the score just assigned counts.
            const promotedAt = yield* Effect.gen(function* () {
              if (issue.promotedAt !== null || promotion === null) return null

              const sessions = yield* scoreRepository.countDistinctSessionsBySignalId({
                projectId: ProjectId(issue.projectId),
                signalId: issue.id,
                since: new Date(assignedAt.getTime() - PROMOTION_WINDOW_DAYS * MILLISECONDS_PER_DAY),
              })

              yield* Effect.annotateCurrentSpan("promotion.sessions", sessions)
              yield* Effect.annotateCurrentSpan("promotion.threshold", promotion.threshold)
              yield* Effect.annotateCurrentSpan("promotion.volume", promotion.volume ?? -1)
              yield* Effect.annotateCurrentSpan("promotion.volumeDegraded", promotion.volume === null)
              yield* Effect.annotateCurrentSpan("promotion.promoted", sessions >= promotion.threshold)

              return sessions >= promotion.threshold ? assignedAt : null
            })

            yield* signalRepository.save(promotedAt === null ? updatedSignal : { ...updatedSignal, promotedAt })
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

            if (promotedAt !== null) {
              yield* outboxEventWriter.write({
                eventName: "SignalPromoted",
                aggregateType: "issue",
                aggregateId: issue.id,
                organizationId: issue.organizationId,
                payload: {
                  organizationId: issue.organizationId,
                  projectId: issue.projectId,
                  signalId: issue.id,
                  promotedAt: promotedAt.toISOString(),
                  triggerScoreId: score.id,
                },
              })
            }

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
    // The Postgres services stay erased like the rest of this package's
    // use-cases, but the promotion gate's cross-store needs are declared: a
    // caller that forgets them fails to compile instead of failing at runtime
    // in one activity.
  }).pipe(Effect.withSpan("issues.assignScoreToSignal")) as Effect.Effect<
    AssignScoreToSignalResult,
    AssignScoreToSignalError,
    CacheStore | ChSqlClient | SessionRepository
  >
