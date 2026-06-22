import type { FilterSet, MonitorStream, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Monitor, MonitorTargetKind } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

export interface ListMonitorsForTargetInput {
  readonly projectId: ProjectId
  readonly stream: MonitorStream
  readonly targetKind?: MonitorTargetKind
  /** Predicate the monitor's target filter set must contain (e.g. `{toolName:[{op:"eq",value}]}`). */
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
