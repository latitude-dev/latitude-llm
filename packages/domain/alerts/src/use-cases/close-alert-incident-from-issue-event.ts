import { OutboxEventWriter } from "@domain/events"
import { OrganizationId, ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { AlertIncidentKind } from "../entities/alert-incident.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"

export interface CloseAlertIncidentFromIssueEventInput {
  readonly kind: Extract<AlertIncidentKind, "issue.escalating">
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly endedAt: Date
  /**
   * Forwarded to the `IncidentClosed` outbox event so downstream consumers
   * (notifications copy, dashboards) can tell whether the band exit, the
   * absolute-rate backstop, or the 72h timeout closed the incident. Optional
   * because legacy `IssueEscalationEnded` events emitted before the seasonal
   * detector landed don't carry a reason.
   */
  readonly reason?: "threshold" | "absolute-rate-drop" | "timeout"
}

export type CloseAlertIncidentFromIssueEventError = RepositoryError

export const closeAlertIncidentFromIssueEventUseCase = (input: CloseAlertIncidentFromIssueEventInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("alertIncident.kind", input.kind)
    yield* Effect.annotateCurrentSpan("alertIncident.issueId", input.issueId)

    const sqlClient = yield* SqlClient

    yield* sqlClient.transaction(
      Effect.gen(function* () {
        const alertIncidentRepository = yield* AlertIncidentRepository
        const outboxEventWriter = yield* OutboxEventWriter

        const closedId = yield* alertIncidentRepository.closeOpen({
          sourceType: "issue",
          sourceId: input.issueId,
          kind: input.kind,
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
            kind: input.kind,
            sourceType: "issue",
            sourceId: input.issueId,
            // Omit when undefined: `exactOptionalPropertyTypes` rejects
            // `{ reason: undefined }` against the optional `reason?:` field.
            ...(input.reason !== undefined ? { reason: input.reason } : {}),
          },
        })
      }),
    )
  }).pipe(Effect.withSpan("alerts.closeAlertIncidentFromIssueEvent")) as Effect.Effect<
    void,
    CloseAlertIncidentFromIssueEventError,
    SqlClient | AlertIncidentRepository | OutboxEventWriter
  >
