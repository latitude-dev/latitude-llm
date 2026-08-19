import { ScoreAnalyticsRepository } from "@domain/scores"
import { type ChSqlClient, ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"

export interface ReconcileConsolidatedScoresInput {
  readonly projectId: string
  readonly survivorId: string
  readonly loserIds: readonly string[]
  readonly scoresMoved: number
  /** ISO timestamp of the oldest score the merge moved; null when it moved none. */
  readonly scoresCreatedFrom: string | null
}

export type ReconcileConsolidatedScoresResult = {
  readonly action: "reconciled" | "skipped"
}

/**
 * ClickHouse half of a candidate consolidation, driven by `SignalsConsolidated`
 * rather than by the merge itself.
 *
 * The merge is idempotent because a re-run finds its losers soft-deleted and
 * no-ops — which is exactly why the reconciliation cannot hang off that retry:
 * it would never be reached again. The outbox event is written inside the merge
 * transaction instead, and at-least-once delivery plus a mutation that matches
 * nothing on a second pass is what closes the window between the two stores.
 */
export const reconcileConsolidatedScoresUseCase = (input: ReconcileConsolidatedScoresInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.survivorId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("consolidation.scoresMoved", input.scoresMoved)

    if (input.scoresMoved === 0 || input.scoresCreatedFrom === null || input.loserIds.length === 0) {
      return { action: "skipped" } satisfies ReconcileConsolidatedScoresResult
    }

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    yield* scoreAnalyticsRepository.reassignSignal({
      projectId: ProjectId(input.projectId),
      fromSignalIds: input.loserIds,
      toSignalId: input.survivorId,
      createdFrom: new Date(input.scoresCreatedFrom),
    })

    return { action: "reconciled" } satisfies ReconcileConsolidatedScoresResult
  }).pipe(Effect.withSpan("issues.reconcileConsolidatedScores")) as Effect.Effect<
    ReconcileConsolidatedScoresResult,
    RepositoryError,
    ChSqlClient | ScoreAnalyticsRepository
  >
