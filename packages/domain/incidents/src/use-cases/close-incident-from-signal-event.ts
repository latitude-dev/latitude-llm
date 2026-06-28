import { OutboxEventWriter } from "@domain/events"
import { OrganizationId, ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { IncidentRepository } from "../ports/incident-repository.ts"

export interface CloseIncidentFromSignalEventInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly endedAt: Date
  /**
   * Forwarded to the `IncidentClosed` outbox event so downstream consumers
   * (notifications copy, dashboards) can tell whether the band exit, the
   * absolute-rate backstop, the 72h timeout, or a manual resolve/ignore
   * closed the incident. Optional because legacy `SignalEscalationEnded`
   * events emitted before the seasonal detector landed don't carry a reason.
   */
  readonly reason?: "threshold" | "absolute-rate-drop" | "timeout" | "resolved" | "ignored"
}

export type CloseIncidentFromSignalEventError = RepositoryError

export const closeIncidentFromSignalEventUseCase = (input: CloseIncidentFromSignalEventInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("incident.sourceType", "signal")
    yield* Effect.annotateCurrentSpan("incident.signalId", input.signalId)

    const sqlClient = yield* SqlClient

    yield* sqlClient.transaction(
      Effect.gen(function* () {
        const incidentRepository = yield* IncidentRepository
        const outboxEventWriter = yield* OutboxEventWriter

        const closedId = yield* incidentRepository.closeOpen({
          sourceType: "signal",
          sourceId: input.signalId,
          endedAt: input.endedAt,
        })

        // No-op if there was no open incident — closing is idempotent and
        // the outbox redelivery path could call this after the row is
        // already closed. Don't emit a phantom IncidentClosed in that case.
        if (closedId === null) return

        yield* outboxEventWriter.write({
          eventName: "IncidentClosed",
          aggregateType: "alert_incident",
          aggregateId: closedId,
          organizationId: OrganizationId(input.organizationId),
          payload: {
            organizationId: OrganizationId(input.organizationId),
            projectId: ProjectId(input.projectId),
            alertIncidentId: closedId,
            sourceType: "signal",
            sourceId: input.signalId,
            // Omit when undefined: `exactOptionalPropertyTypes` rejects
            // `{ reason: undefined }` against the optional `reason?:` field.
            ...(input.reason !== undefined ? { reason: input.reason } : {}),
          },
        })
      }),
    )
  }).pipe(Effect.withSpan("incidents.closeIncidentFromSignalEvent")) as Effect.Effect<
    void,
    CloseIncidentFromSignalEventError,
    SqlClient | IncidentRepository | OutboxEventWriter
  >
