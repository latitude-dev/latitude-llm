import { OutboxEventWriter } from "@domain/events"
import { AlertIncidentId, generateId, OrganizationId, ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { type AlertIncident, type AlertIncidentKind, SEVERITY_FOR_KIND } from "../entities/alert-incident.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"

export interface CreateAlertIncidentFromIssueEventInput {
  readonly kind: AlertIncidentKind
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly occurredAt: Date
}

export type CreateAlertIncidentFromIssueEventError = RepositoryError

export const createAlertIncidentFromIssueEventUseCase = (input: CreateAlertIncidentFromIssueEventInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("alertIncident.kind", input.kind)
    yield* Effect.annotateCurrentSpan("alertIncident.issueId", input.issueId)
    yield* Effect.annotateCurrentSpan("alertIncident.projectId", input.projectId)

    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const alertIncidentRepository = yield* AlertIncidentRepository
        const outboxEventWriter = yield* OutboxEventWriter

        const now = new Date()
        const incident: AlertIncident = {
          id: AlertIncidentId(generateId()),
          organizationId: OrganizationId(input.organizationId),
          projectId: ProjectId(input.projectId),
          sourceType: "issue",
          sourceId: input.issueId,
          kind: input.kind,
          severity: SEVERITY_FOR_KIND[input.kind],
          startedAt: input.occurredAt,
          endedAt: null,
          createdAt: now,
        }

        yield* alertIncidentRepository.insert(incident)

        yield* outboxEventWriter.write({
          eventName: "IncidentCreated",
          aggregateType: "alert_incident",
          aggregateId: incident.id,
          organizationId: incident.organizationId,
          payload: {
            organizationId: incident.organizationId,
            projectId: incident.projectId,
            alertIncidentId: incident.id,
            kind: incident.kind,
            sourceType: incident.sourceType,
            sourceId: incident.sourceId,
          },
        })

        return incident
      }),
    )
  }).pipe(Effect.withSpan("alerts.createAlertIncidentFromIssueEvent")) as Effect.Effect<
    AlertIncident,
    CreateAlertIncidentFromIssueEventError,
    SqlClient | AlertIncidentRepository | OutboxEventWriter
  >
