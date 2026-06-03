import {
  ALERT_INCIDENT_KIND_SOURCE_TYPE,
  type AlertIncidentKind,
  type ProjectId,
  type RepositoryError,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import type { MonitorAlert } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

export interface ResolveMonitorAlertsForSourceEventInput {
  readonly projectId: ProjectId
  readonly kind: AlertIncidentKind
  readonly sourceId: string
}

/** Active monitor alerts a source event fires (one incident per returned alert). Source type is derived from the kind. */
export const resolveMonitorAlertsForSourceEventUseCase = (
  input: ResolveMonitorAlertsForSourceEventInput,
): Effect.Effect<readonly MonitorAlert[], RepositoryError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const repository = yield* MonitorRepository
    return yield* repository.listActiveAlertsForSourceEvent({
      projectId: input.projectId,
      kind: input.kind,
      sourceType: ALERT_INCIDENT_KIND_SOURCE_TYPE[input.kind],
      sourceId: input.sourceId,
    })
  })
