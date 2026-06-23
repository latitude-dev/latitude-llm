import { OutboxEventWriter } from "@domain/events"
import type { AlertIncidentId, NotFoundError, RepositoryError } from "@domain/shared"
import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Incident } from "../entities/incident.ts"
import { IncidentRepository } from "../ports/incident-repository.ts"

export interface ResolveIncidentInput {
  readonly id: AlertIncidentId
  readonly endedAt: Date
}

export type ResolveIncidentError = NotFoundError | RepositoryError

/**
 * User-initiated close of an ongoing incident. Emits `IncidentClosed` with
 * reason `"resolved"`, which suppresses the recovery notification — a
 * deliberate user action shouldn't read as an organic recovery. Idempotent:
 * an already-closed incident is returned as-is without emitting again.
 */
export const resolveIncidentUseCase = (input: ResolveIncidentInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("incident.id", input.id)

    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const incidentRepository = yield* IncidentRepository
        const outboxEventWriter = yield* OutboxEventWriter

        const closed = yield* incidentRepository.closeById({ id: input.id, endedAt: input.endedAt })
        // Missing or resolved concurrently — fall back to the stored row so a
        // double-click stays a no-op and a bad id still surfaces NotFoundError.
        if (closed === null) return yield* incidentRepository.findById(input.id)

        yield* outboxEventWriter.write({
          eventName: "IncidentClosed",
          aggregateType: "alert_incident",
          aggregateId: closed.id,
          organizationId: closed.organizationId,
          payload: {
            organizationId: closed.organizationId,
            projectId: closed.projectId,
            alertIncidentId: closed.id,
            sourceType: closed.sourceType,
            sourceId: closed.sourceId,
            reason: "resolved",
          },
        })

        return closed
      }),
    )
  }).pipe(Effect.withSpan("incidents.resolveIncident")) as Effect.Effect<
    Incident,
    ResolveIncidentError,
    SqlClient | IncidentRepository | OutboxEventWriter
  >
