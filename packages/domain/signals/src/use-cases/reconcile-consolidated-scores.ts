import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { type ChSqlClient, ProjectId, type RepositoryError, SignalId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { CONSOLIDATION_MAX_LINEAGE_DEPTH } from "../constants.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

export interface ReconcileConsolidatedScoresInput {
  readonly projectId: string
  readonly survivorId: string
}

export type ReconcileConsolidatedScoresResult = {
  readonly action: "reconciled" | "skipped"
  readonly absorbed: number
}

/**
 * ClickHouse half of a candidate consolidation, driven by `SignalsConsolidated`
 * rather than by the merge itself.
 *
 * The merge is idempotent because a re-run finds its losers soft-deleted and
 * no-ops, which is exactly why the reconciliation cannot hang off that retry: it
 * would never be reached again. The outbox event is written inside the merge
 * transaction instead, and at-least-once delivery plus a mutation that matches
 * nothing on a second pass is what closes the window between the two stores.
 *
 * The sweep set is the survivor's whole absorbed lineage, resolved here rather
 * than taken from the event. Two merges in a chain (`B → A`, then `A → C`) can
 * have their jobs run in either order, and the later one's predicate covers what
 * the earlier one may not have moved yet, so both orders converge on the same
 * final owner.
 */
export const reconcileConsolidatedScoresUseCase = (input: ReconcileConsolidatedScoresInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.survivorId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const signals = yield* SignalRepository
    const projectId = ProjectId(input.projectId)
    const survivorId = SignalId(input.survivorId)
    const absorbed = yield* signals.findAbsorbedLineage({
      survivorId,
      maxDepth: CONSOLIDATION_MAX_LINEAGE_DEPTH,
    })

    yield* Effect.annotateCurrentSpan("consolidation.absorbed", absorbed.length)
    if (absorbed.length === 0) {
      return { action: "skipped", absorbed: 0 } satisfies ReconcileConsolidatedScoresResult
    }

    // Bounds the partitions the mutation walks. Read from the survivor because
    // Postgres already owns the merged set, and a replayed annotation can be
    // older than any signal in the merge.
    const scoreRepository = yield* ScoreRepository
    const createdFrom = yield* scoreRepository.findEarliestCreatedAtBySignalId({ projectId, signalId: survivorId })
    if (createdFrom === null) {
      return { action: "skipped", absorbed: absorbed.length } satisfies ReconcileConsolidatedScoresResult
    }

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    yield* scoreAnalyticsRepository.reassignSignal({
      projectId,
      fromSignalIds: absorbed,
      toSignalId: survivorId,
      createdFrom,
    })

    return { action: "reconciled", absorbed: absorbed.length } satisfies ReconcileConsolidatedScoresResult
  }).pipe(Effect.withSpan("issues.reconcileConsolidatedScores")) as Effect.Effect<
    ReconcileConsolidatedScoresResult,
    RepositoryError,
    ChSqlClient | ScoreAnalyticsRepository | ScoreRepository | SignalRepository | SqlClient
  >
