import { OutboxEventWriter } from "@domain/events"
import { ScoreRepository } from "@domain/scores"
import {
  type CacheError,
  type CacheStore,
  type ChSqlClient,
  type DistributedLockRepository,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SignalId,
  SqlClient,
} from "@domain/shared"
import type { SessionRepository } from "@domain/spans"
import { Effect } from "effect"
import {
  CONSOLIDATION_MAX_MERGES_PER_PASS,
  CONSOLIDATION_MIN_SIMILARITY,
  CONSOLIDATION_NEIGHBOR_LIMIT,
  PROMOTION_WINDOW_DAYS,
  SIGNAL_UPDATE_LOCK_KEY,
  SIGNAL_UPDATE_LOCK_TTL_SECONDS,
} from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import type { SignalDiscoveryLockUnavailableError } from "../errors.ts"
import { mergeSignalCentroids } from "../helpers.ts"
import { withSignalDiscoveryLock } from "../locks.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { promotionThresholdForVolume } from "../promotion.ts"
import { qualifySignalForPromotion } from "./qualify-signal-for-promotion.ts"
import { resolveProjectSessionVolumeUseCase } from "./resolve-project-session-volume.ts"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export interface ConsolidateSignalCandidatesInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
}

export type ConsolidateSignalCandidatesResult =
  | {
      readonly action: "merged"
      readonly survivorId: string
      readonly loserIds: readonly string[]
      readonly capBound: boolean
      readonly qualified: boolean
    }
  | {
      readonly action: "skipped"
      readonly reason: "not-found" | "promoted" | "no-neighbors" | "raced"
    }

export type ConsolidateSignalCandidatesError = CacheError | RepositoryError | SignalDiscoveryLockUnavailableError

/**
 * Every participant's per-signal lock, acquired in ascending id order.
 *
 * The ordering is what keeps two overlapping passes from deadlocking, and
 * locking the losers matters as much as locking the survivor: an unlocked loser
 * can take a concurrent score assignment while this merge reassigns its scores
 * and deletes it, which strands that score on a deleted row and loses the
 * evidence for good.
 */
const withParticipantLocks = <A, E, R>(
  context: { readonly organizationId: string; readonly projectId: ProjectId },
  signalIds: readonly string[],
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | CacheError | SignalDiscoveryLockUnavailableError, R | DistributedLockRepository> => {
  const [head, ...rest] = signalIds
  if (head === undefined) return effect
  return withSignalDiscoveryLock(
    {
      organizationId: context.organizationId,
      projectId: context.projectId,
      lockKey: SIGNAL_UPDATE_LOCK_KEY(head),
      ttlSeconds: SIGNAL_UPDATE_LOCK_TTL_SECONDS,
    },
    withParticipantLocks(context, rest, effect),
  )
}

/**
 * The candidate whose evidence survives the merge: the best-supported cluster,
 * so the surviving centroid is the one built from the most sessions. Ties break
 * toward the oldest candidate, and then toward the lowest id, so the choice is
 * total and two concurrent passes over the same set cannot disagree.
 */
const selectSurvivor = (candidates: readonly { readonly signal: Signal; readonly sessions: number }[]) =>
  candidates.reduce((best, candidate) => {
    if (candidate.sessions !== best.sessions) return candidate.sessions > best.sessions ? candidate : best
    const ageDelta = candidate.signal.createdAt.getTime() - best.signal.createdAt.getTime()
    if (ageDelta !== 0) return ageDelta < 0 ? candidate : best
    return candidate.signal.id < best.signal.id ? candidate : best
  })

const foldLoserCentroids = ({
  survivor,
  losers,
  mergedAt,
}: {
  readonly survivor: Signal
  readonly losers: readonly Signal[]
  readonly mergedAt: Date
}): Signal => {
  if (survivor.centroid === null) return { ...survivor, updatedAt: mergedAt }

  let centroid = { ...survivor.centroid, clusteredAt: survivor.clusteredAt ?? mergedAt }
  for (const loser of losers) {
    if (loser.centroid === null || loser.centroid.mass <= 0) continue
    centroid = mergeSignalCentroids({
      survivor: centroid,
      loser: { ...loser.centroid, clusteredAt: loser.clusteredAt ?? mergedAt },
      timestamp: mergedAt,
    })
  }

  return { ...survivor, centroid, clusteredAt: centroid.clusteredAt, updatedAt: mergedAt }
}

/**
 * Merge near-duplicate candidates into one, so a problem fragmented across
 * several one-session signals can reach the promotion gate it could never reach
 * apart.
 *
 * Candidate-to-candidate only, and the repository enforces it: the neighbor scan
 * runs with `unpromotedOnly`, so a promoted signal is neither absorbed nor
 * chosen as a survivor. Merging candidates destroys no user-visible identity —
 * nothing has ever been announced, assigned, escalated or linked — which is what
 * makes a real merge safe here and keeps the retired v1 merge system retired.
 *
 * Matching is centroid-only on purpose. Consolidation exists to catch what live
 * matching rejected, and what it rejected was rejected largely by the rerank
 * gate over name and description — the channel a candidate's placeholder makes
 * unreliable. Re-applying that gate here would make the pass a no-op by
 * construction.
 */
export const consolidateSignalCandidatesUseCase = (input: ConsolidateSignalCandidatesInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const signals = yield* SignalRepository
    const projectId = ProjectId(input.projectId)
    const source = yield* signals.findById(SignalId(input.signalId), { includeUnpromoted: true }).pipe(
      Effect.map((signal) => ({ action: "found", signal }) as const),
      Effect.catchTag("NotFoundError", () => Effect.succeed({ action: "not-found" } as const)),
    )

    if (source.action === "not-found") {
      return { action: "skipped", reason: "not-found" } satisfies ConsolidateSignalCandidatesResult
    }
    if (source.signal.promotedAt !== null) {
      return { action: "skipped", reason: "promoted" } satisfies ConsolidateSignalCandidatesResult
    }

    const neighbors = yield* signals.findSimilarByCentroid({
      projectId,
      signalId: SignalId(input.signalId),
      limit: CONSOLIDATION_NEIGHBOR_LIMIT,
      unpromotedOnly: true,
    })
    const admitted = neighbors.filter((neighbor) => neighbor.similarity >= CONSOLIDATION_MIN_SIMILARITY)
    const merging = admitted.slice(0, CONSOLIDATION_MAX_MERGES_PER_PASS)
    const capBound = admitted.length > merging.length

    yield* Effect.annotateCurrentSpan("consolidation.neighbors", neighbors.length)
    yield* Effect.annotateCurrentSpan("consolidation.admitted", admitted.length)
    yield* Effect.annotateCurrentSpan("consolidation.capBound", capBound)

    if (merging.length === 0) {
      return { action: "skipped", reason: "no-neighbors" } satisfies ConsolidateSignalCandidatesResult
    }

    // Resolved before the locks and the transaction: it reads Redis and
    // ClickHouse, and a merge can carry the survivor over the gate.
    const volume = yield* resolveProjectSessionVolumeUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId,
    })
    const threshold = promotionThresholdForVolume(volume)

    const participantIds = [input.signalId, ...merging.map((neighbor) => neighbor.signalId)].sort()
    const sqlClient = yield* SqlClient

    return yield* withParticipantLocks(
      { organizationId: input.organizationId, projectId },
      participantIds,
      sqlClient.transaction(
        Effect.gen(function* () {
          const signalRepository = yield* SignalRepository
          const scoreRepository = yield* ScoreRepository
          const outboxEventWriter = yield* OutboxEventWriter
          const mergedAt = new Date()

          // Re-read under the row locks. The neighbor scan ran unlocked, so a
          // participant may since have been promoted, deleted, or absorbed by an
          // overlapping pass; anything that is no longer a live candidate of this
          // project drops out here.
          const participants = yield* Effect.forEach(participantIds, (signalId) =>
            signalRepository.findByIdForUpdate(SignalId(signalId)).pipe(
              Effect.map((signal) => signal as Signal | null),
              Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
            ),
          )
          const live = participants.filter(
            (signal): signal is Signal =>
              signal !== null &&
              signal.projectId === input.projectId &&
              signal.promotedAt === null &&
              signal.deletedAt == null,
          )

          if (live.length < 2) {
            return { action: "skipped", reason: "raced" } satisfies ConsolidateSignalCandidatesResult
          }

          const withEvidence = yield* Effect.forEach(live, (signal) =>
            scoreRepository
              .countDistinctSessionsBySignalId({
                projectId,
                signalId: signal.id,
                since: new Date(mergedAt.getTime() - PROMOTION_WINDOW_DAYS * MILLISECONDS_PER_DAY),
              })
              .pipe(Effect.map((sessions) => ({ signal, sessions }))),
          )
          const survivor = selectSurvivor(withEvidence).signal
          const losers = live.filter((signal) => signal.id !== survivor.id)

          const reassigned = yield* scoreRepository.reassignSignal({
            projectId,
            fromSignalIds: losers.map((loser) => loser.id),
            toSignalId: survivor.id,
            updatedAt: mergedAt,
          })

          const merged = foldLoserCentroids({ survivor, losers, mergedAt })
          yield* signalRepository.save(merged)
          yield* Effect.forEach(losers, (loser) => signalRepository.softDelete(loser.id), { discard: true })

          yield* outboxEventWriter.write({
            eventName: "SignalsConsolidated",
            aggregateType: "issue",
            aggregateId: survivor.id,
            organizationId: survivor.organizationId,
            payload: {
              organizationId: survivor.organizationId,
              projectId: survivor.projectId,
              survivorId: survivor.id,
              loserIds: losers.map((loser) => loser.id),
              consolidatedAt: mergedAt.toISOString(),
              scoresMoved: reassigned.count,
              scoresCreatedFrom: reassigned.earliestCreatedAt?.toISOString() ?? null,
            },
          })

          // Counted after the reassignment, so the union of the merged clusters
          // is what faces the gate. The survivor keeps its placeholder name
          // either way: promotion is what names a signal from its cluster, and
          // that is exactly the cluster this merge just assembled.
          const qualified = yield* qualifySignalForPromotion({
            signal: merged,
            threshold,
            at: mergedAt,
            triggerScoreId: null,
          })

          yield* Effect.annotateCurrentSpan("consolidation.survivorId", survivor.id)
          yield* Effect.annotateCurrentSpan("consolidation.merges", losers.length)
          yield* Effect.annotateCurrentSpan("consolidation.scoresMoved", reassigned.count)

          return {
            action: "merged",
            survivorId: survivor.id,
            loserIds: losers.map((loser) => loser.id),
            capBound,
            qualified,
          } satisfies ConsolidateSignalCandidatesResult
        }),
      ),
    )
    // Same erasure as the sibling discovery use-cases, with the promotion gate's
    // cross-store needs declared so a caller that forgets a layer fails to
    // compile rather than at runtime in one job.
  }).pipe(Effect.withSpan("issues.consolidateSignalCandidates")) as Effect.Effect<
    ConsolidateSignalCandidatesResult,
    ConsolidateSignalCandidatesError,
    CacheStore | ChSqlClient | SessionRepository
  >
