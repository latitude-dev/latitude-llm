import { ScoreAnalyticsRepository } from "@domain/scores"
import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SqlClient, TraceId } from "@domain/shared"
import { Effect } from "effect"
import type { Signal } from "../entities/signal.ts"
import { deriveSignalLifecycleStates } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

/** A signal with occurrence stats scoped to one session. */
export interface SessionSignal {
  readonly id: string
  readonly projectId: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly source: Signal["source"]
  readonly states: readonly string[]
  readonly resolvedAt: Date | null
  readonly ignoredAt: Date | null
  readonly regressedAt: Date | null
  readonly mutedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly occurrences: number
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly traceIds: readonly string[]
}

export interface ListSessionSignalsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /**
   * Traces of the session. Signals are rolled up over these `traceIds` (not
   * `session_id`) so orphan sessions still surface their issues — raw score
   * rows carry a `trace_id` but no `session_id`.
   */
  readonly traceIds: readonly TraceId[]
  readonly now?: Date
}

export type ListSessionSignalsError = RepositoryError

/**
 * Returns one row per signal that occurred across the session's traces, with
 * occurrence stats scoped to those traces. Ordered by last-seen descending.
 */
export const listSessionSignalsUseCase = (
  input: ListSessionSignalsInput,
): Effect.Effect<
  readonly SessionSignal[],
  ListSessionSignalsError,
  ChSqlClient | SqlClient | ScoreAnalyticsRepository | SignalRepository
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    if (input.traceIds.length === 0) return []

    const now = input.now ?? new Date()
    const analytics = yield* ScoreAnalyticsRepository
    const signalRepository = yield* SignalRepository

    const rollups = yield* analytics.listSignalsByTraceIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceIds: input.traceIds,
    })
    if (rollups.length === 0) return []

    const issues = yield* signalRepository.findByIds({
      projectId: input.projectId,
      signalIds: rollups.map((rollup) => rollup.signalId),
    })
    const signalsById = new Map(issues.map((issue) => [issue.id, issue]))

    // Preserve the ClickHouse last-seen ordering; drop any rollup whose issue
    // was hard-deleted in Postgres but still has lingering score rows.
    return rollups.flatMap((rollup): SessionSignal[] => {
      const issue = signalsById.get(rollup.signalId)
      if (!issue) return []
      const states = deriveSignalLifecycleStates({ issue, isEscalating: issue.lifecycle.isEscalating, now })
      return [
        {
          id: issue.id as string,
          projectId: issue.projectId,
          slug: issue.slug,
          name: issue.name,
          description: issue.description,
          source: issue.source,
          states: [...states],
          resolvedAt: issue.resolvedAt,
          ignoredAt: issue.ignoredAt,
          regressedAt: issue.regressedAt,
          mutedAt: issue.mutedAt,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          occurrences: rollup.occurrences,
          firstSeenAt: rollup.firstSeenAt,
          lastSeenAt: rollup.lastSeenAt,
          traceIds: rollup.traceIds.map((traceId) => traceId as string),
        },
      ]
    })
  }).pipe(Effect.withSpan("signals.listSessionSignals"))
