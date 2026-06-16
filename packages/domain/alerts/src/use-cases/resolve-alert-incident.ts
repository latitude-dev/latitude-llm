import { OutboxEventWriter } from "@domain/events"
import type { AlertIncidentId, NotFoundError, RepositoryError } from "@domain/shared"
import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { AlertIncident } from "../entities/alert-incident.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"

export interface ResolveAlertIncidentInput {
  readonly id: AlertIncidentId
  readonly endedAt: Date
}

export type ResolveAlertIncidentError = NotFoundError | RepositoryError

/**
 * User-initiated close of an ongoing incident. Emits `IncidentClosed` with
 * reason `"resolved"`, which suppresses the recovery notification — a
 * deliberate user action shouldn't read as an organic recovery. Idempotent:
 * an already-closed incident is returned as-is without emitting again.
 */
export const resolveAlertIncidentUseCase = (input: ResolveAlertIncidentInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("alertIncident.id", input.id)

    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const alertIncidentRepository = yield* AlertIncidentRepository
        const outboxEventWriter = yield* OutboxEventWriter

        const closed = yield* alertIncidentRepository.closeById({ id: input.id, endedAt: input.endedAt })
        // Missing or resolved concurrently — fall back to the stored row so a
        // double-click stays a no-op and a bad id still surfaces NotFoundError.
        if (closed === null) return yield* alertIncidentRepository.findById(input.id)

        // Source-based incidents (issue/savedSearch) drive the existing notification payload.
        // Unified `event.*`/`metric.*` incidents are sourceless — their close notification is
        // wired with the firing path; the source-based event is skipped for them.
        if (closed.sourceType !== null && closed.sourceId !== null) {
          yield* outboxEventWriter.write({
            eventName: "IncidentClosed",
            aggregateType: "alert_incident",
            aggregateId: closed.id,
            organizationId: closed.organizationId,
            payload: {
              organizationId: closed.organizationId,
              projectId: closed.projectId,
              alertIncidentId: closed.id,
              kind: closed.kind,
              sourceType: closed.sourceType,
              sourceId: closed.sourceId,
              reason: "resolved",
            },
          })
        }

        return closed
      }),
    )
  }).pipe(Effect.withSpan("alerts.resolveAlertIncident")) as Effect.Effect<
    AlertIncident,
    ResolveAlertIncidentError,
    SqlClient | AlertIncidentRepository | OutboxEventWriter
  >
