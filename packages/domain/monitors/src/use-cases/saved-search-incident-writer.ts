import { type AlertIncident, AlertIncidentRepository, type SavedSearchEntrySignals } from "@domain/alerts"
import { OutboxEventWriter } from "@domain/events"
import { AlertIncidentId, generateId, type OrganizationId, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { MonitorAlert } from "../entities/monitor.ts"

/** Shared incident-row shape for the three state machines — the one thing they share. Callers invoke the writers inside their own transaction. */
interface OpenSavedSearchIncidentInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly alert: MonitorAlert
  /** The watched saved search's id (the incident's `sourceId`). */
  readonly sourceId: string
  readonly startedAt: Date
  /** `null` keeps a sustained / rearm incident open; `= startedAt` collapses a point-in-time one. */
  readonly endedAt: Date | null
  /** Frozen threshold snapshot for `savedSearch.escalating`; `null` otherwise. */
  readonly entrySignals: SavedSearchEntrySignals | null
  readonly now: Date
}

/** Insert the incident row + emit `IncidentCreated`. Returns the inserted row. */
export const openSavedSearchIncident = (input: OpenSavedSearchIncidentInput) =>
  Effect.gen(function* () {
    const alertIncidentRepository = yield* AlertIncidentRepository
    const outboxEventWriter = yield* OutboxEventWriter

    const incident: AlertIncident = {
      id: AlertIncidentId(generateId()),
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceType: "savedSearch",
      sourceId: input.sourceId,
      kind: input.alert.kind,
      severity: input.alert.severity,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      createdAt: input.now,
      entrySignals: input.entrySignals,
      exitEligibleSince: null,
      monitorAlertId: input.alert.id,
      condition: input.alert.condition,
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
  })

/** Set `ended_at` + emit `IncidentClosed`. `savedSearch.escalating` only — the multiplier silent close sets `ended_at` directly (no event). */
export const closeSavedSearchIncident = (incident: AlertIncident, endedAt: Date) =>
  Effect.gen(function* () {
    const alertIncidentRepository = yield* AlertIncidentRepository
    const outboxEventWriter = yield* OutboxEventWriter

    yield* alertIncidentRepository.setEndedAt({ id: incident.id, endedAt })
    yield* outboxEventWriter.write({
      eventName: "IncidentClosed",
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
        reason: "threshold",
      },
    })
  })
