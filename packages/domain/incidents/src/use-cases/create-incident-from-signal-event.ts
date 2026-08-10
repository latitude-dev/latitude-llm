import { OutboxEventWriter } from "@domain/events"
import {
  type AlertIncidentCondition,
  AlertIncidentId,
  type AlertSeverity,
  generateId,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import type { EntrySignalsSnapshot, Incident } from "../entities/incident.ts"
import { IncidentRepository } from "../ports/incident-repository.ts"

export interface CreateIncidentFromSignalEventInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly occurredAt: Date
  /**
   * Snapshot of the seasonal-anomaly signals at the moment of entry. Carried
   * on signal escalation incidents so the close-side detector can reference
   * the conditions that tripped open. `null` for kinds that don't escalate
   * and (during the rollout) for legacy `SignalEscalated` events emitted
   * before the seasonal detector started snapshotting.
   */
  readonly entrySignals?: EntrySignalsSnapshot | null
  readonly condition?: AlertIncidentCondition | null
  /**
   * Incident severity. No caller passes it today — every real signal escalation
   * opens at `"high"` — so this exists for a caller that wants to override, and
   * the tests are its only exercise. Do not read the parameter's existence as
   * evidence that escalations carry the signal's own level; they do not.
   */
  readonly severity?: AlertSeverity
}

export type CreateIncidentFromSignalEventError = RepositoryError

export const createIncidentFromSignalEventUseCase = (input: CreateIncidentFromSignalEventInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("incident.sourceType", "signal")
    yield* Effect.annotateCurrentSpan("incident.signalId", input.signalId)
    yield* Effect.annotateCurrentSpan("incident.projectId", input.projectId)

    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const incidentRepository = yield* IncidentRepository
        const outboxEventWriter = yield* OutboxEventWriter

        const now = new Date()
        const incident: Incident = {
          id: AlertIncidentId(generateId()),
          organizationId: OrganizationId(input.organizationId),
          projectId: ProjectId(input.projectId),
          sourceType: "signal",
          sourceId: input.signalId,
          severity: input.severity ?? "high",
          startedAt: input.occurredAt,
          endedAt: null,
          createdAt: now,
          entrySignals: input.entrySignals ?? null,
          exitEligibleSince: null,
          condition: input.condition ?? null,
        }

        yield* incidentRepository.insert(incident)

        yield* outboxEventWriter.write({
          eventName: "IncidentCreated",
          aggregateType: "alert_incident",
          aggregateId: incident.id,
          organizationId: incident.organizationId,
          payload: {
            organizationId: incident.organizationId,
            projectId: incident.projectId,
            alertIncidentId: incident.id,
            sourceType: "signal",
            sourceId: input.signalId,
          },
        })

        return incident
      }),
    )
  }).pipe(Effect.withSpan("incidents.createIncidentFromSignalEvent")) as Effect.Effect<
    Incident,
    CreateIncidentFromSignalEventError,
    SqlClient | IncidentRepository | OutboxEventWriter
  >
