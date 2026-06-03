import { OutboxEventWriter } from "@domain/events"
import {
  type AlertIncidentCondition,
  AlertIncidentId,
  generateId,
  type MonitorAlertId,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import {
  type AlertIncident,
  type AlertIncidentKind,
  type EntrySignalsSnapshot,
  SEVERITY_FOR_KIND,
} from "../entities/alert-incident.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"

export interface CreateAlertIncidentFromIssueEventInput {
  readonly kind: AlertIncidentKind
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly occurredAt: Date
  /**
   * Snapshot of the seasonal-anomaly signals at the moment of entry. Carried
   * on `issue.escalating` incidents so the close-side detector can reference
   * the conditions that tripped open. `null` for kinds that don't escalate
   * and (during the rollout) for legacy `IssueEscalated` events emitted
   * before the seasonal detector started snapshotting.
   */
  readonly entrySignals?: EntrySignalsSnapshot | null
  readonly monitorAlertId?: MonitorAlertId | null
  readonly condition?: AlertIncidentCondition | null
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
        // `issue.escalating` opens with `endedAt: null` and is closed later by
        // `closeAlertIncidentFromIssueEventUseCase`. Eventful kinds have no
        // close step — collapse them to a point in time by setting `endedAt`
        // equal to `startedAt` so the rendering layer can decide point-vs-range
        // purely from timestamps.
        const endedAt = input.kind === "issue.escalating" ? null : input.occurredAt
        const incident: AlertIncident = {
          id: AlertIncidentId(generateId()),
          organizationId: OrganizationId(input.organizationId),
          projectId: ProjectId(input.projectId),
          sourceType: "issue",
          sourceId: input.issueId,
          kind: input.kind,
          severity: SEVERITY_FOR_KIND[input.kind],
          startedAt: input.occurredAt,
          endedAt,
          createdAt: now,
          entrySignals: input.entrySignals ?? null,
          exitEligibleSince: null,
          monitorAlertId: input.monitorAlertId ?? null,
          condition: input.condition ?? null,
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
