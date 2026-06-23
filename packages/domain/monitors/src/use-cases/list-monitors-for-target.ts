import type { FilterSet, MonitorTargetType, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

export interface ListMonitorsForTargetInput {
  readonly projectId: ProjectId
  readonly targetType?: MonitorTargetType
  readonly filterSetContains: FilterSet
}

/** Live unified monitors targeting a specific tool/user — backs the in-context "monitors for this X" lists. */
export const listMonitorsForTargetUseCase = (
  input: ListMonitorsForTargetInput,
): Effect.Effect<readonly Monitor[], RepositoryError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const monitorRepository = yield* MonitorRepository
    return yield* monitorRepository.listMonitorsForTarget(input)
  }).pipe(Effect.withSpan("monitors.listMonitorsForTarget"))
