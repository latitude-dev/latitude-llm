import { ScoreAnalyticsRepository } from "@domain/scores"
import type { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Signal, SignalState } from "../entities/issue.ts"
import { deriveSignalLifecycleStates } from "../helpers.ts"
import { SignalRepository } from "../ports/issue-repository.ts"

export interface ListUserSignalsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly userId: ExternalUserId
  readonly limit?: number
}

export interface UserSignalItem {
  readonly issue: Signal
  readonly states: readonly SignalState[]
  readonly occurrences: number
  /** Distinct traces of the user that contributed an occurrence. */
  readonly affectedTraces: number
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
}

export type ListUserSignalsError = RepositoryError

/**
 * Signals that occurred on the given end-user's traces, ordered by most recent
 * occurrence first. Occurrence counts are user-scoped (only scores on the
 * user's traces), while the issue rows and lifecycle states are the project's.
 */
export const listUserSignalsUseCase = (
  input: ListUserSignalsInput,
): Effect.Effect<
  readonly UserSignalItem[],
  ListUserSignalsError,
  ChSqlClient | SqlClient | ScoreAnalyticsRepository | SignalRepository
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("userId", String(input.userId))

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const signalRepository = yield* SignalRepository
    const now = new Date()

    const rollups = yield* scoreAnalyticsRepository.listSignalsByUser({
      organizationId: input.organizationId,
      projectId: input.projectId,
      userId: input.userId,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    if (rollups.length === 0) return []

    const issues = yield* signalRepository.findByIds({
      projectId: input.projectId,
      signalIds: rollups.map((rollup) => rollup.signalId),
    })
    const signalById = new Map(issues.map((issue) => [issue.id, issue] as const))

    return rollups.flatMap((rollup): UserSignalItem[] => {
      const issue = signalById.get(rollup.signalId)
      if (!issue) return []
      return [
        {
          issue,
          states: deriveSignalLifecycleStates({
            issue,
            isEscalating: issue.lifecycle.isEscalating,
            isRegressed: issue.lifecycle.isRegressed,
            now,
          }),
          occurrences: rollup.occurrences,
          affectedTraces: rollup.affectedTraces,
          firstSeenAt: rollup.firstSeenAt,
          lastSeenAt: rollup.lastSeenAt,
        },
      ]
    })
  }).pipe(Effect.withSpan("issues.listUserSignals"))
