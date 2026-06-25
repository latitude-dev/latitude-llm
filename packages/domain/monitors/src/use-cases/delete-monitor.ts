import { OutboxEventWriter } from "@domain/events"
import { IncidentRepository } from "@domain/incidents"
import { type MonitorId, type NotFoundError, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { SystemMonitorForbiddenError } from "../errors.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

export interface DeleteMonitorInput {
  readonly id: MonitorId
}

export type DeleteMonitorError = NotFoundError | RepositoryError | SystemMonitorForbiddenError

/**
 * Soft-deletes a user monitor (and cascades `deletedAt` to its alerts, so it
 * stops firing while existing incidents stay attributable). Rejects system
 * monitors — they're structurally locked.
 */
export const deleteMonitorUseCase = (
  input: DeleteMonitorInput,
): Effect.Effect<Monitor, DeleteMonitorError, SqlClient | MonitorRepository | IncidentRepository | OutboxEventWriter> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const monitor = yield* repository.findById(input.id)
        if (monitor.system) {
          return yield* new SystemMonitorForbiddenError({ monitorId: input.id, operation: "deleted" })
        }
        const incidentRepository = yield* IncidentRepository
        const outboxEventWriter = yield* OutboxEventWriter
        const now = new Date()
        yield* repository.softDelete(input.id)
        const closedId = yield* incidentRepository.closeOpen({
          sourceType: "monitor",
          sourceId: input.id,
          endedAt: now,
        })
        if (closedId !== null) {
          yield* outboxEventWriter.write({
            eventName: "IncidentClosed",
            aggregateType: "alert_incident",
            aggregateId: closedId,
            organizationId: monitor.organizationId,
            payload: {
              organizationId: monitor.organizationId,
              projectId: monitor.projectId,
              alertIncidentId: closedId,
              sourceType: "monitor",
              sourceId: monitor.id,
            },
          })
        }
        return { ...monitor, deletedAt: now, updatedAt: now }
      }),
    )
  }) as Effect.Effect<
    Monitor,
    DeleteMonitorError,
    SqlClient | MonitorRepository | IncidentRepository | OutboxEventWriter
  >
