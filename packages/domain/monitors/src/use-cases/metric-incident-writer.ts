import { type AlertIncident, AlertIncidentRepository, type SavedSearchEntrySignals } from "@domain/alerts"
import { AlertIncidentId, generateId, type OrganizationId, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { MonitorAlert } from "../entities/monitor.ts"

/**
 * Incident-row writers for the unified `event.*`/`metric.*` state machines. Unlike
 * the saved-search writer these incidents are **sourceless** — the watched target
 * lives on the monitor (recovered via `monitorAlertId`). They do NOT emit
 * `IncidentCreated`/`IncidentClosed`: the source-based notification pipeline skips
 * sourceless incidents, so target-based notification copy is wired separately.
 * TODO(unified-notifications): emit a target-based notification on open/close.
 */
interface OpenMetricIncidentInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly alert: MonitorAlert
  readonly startedAt: Date
  /** `null` keeps a sustained / rearm incident open; `= startedAt` collapses a point-in-time one. */
  readonly endedAt: Date | null
  /** Frozen threshold snapshot for `metric.escalating`; `null` otherwise. */
  readonly entrySignals: SavedSearchEntrySignals | null
  readonly now: Date
}

/** Insert a sourceless incident row. Returns the inserted row. No outbox event (see file note). */
export const openMetricIncident = (input: OpenMetricIncidentInput) =>
  Effect.gen(function* () {
    const alertIncidentRepository = yield* AlertIncidentRepository
    const incident: AlertIncident = {
      id: AlertIncidentId(generateId()),
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceType: null,
      sourceId: null,
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
    return incident
  })

/** Close a sourceless incident row by stamping `ended_at`. No outbox event (see file note). */
export const closeMetricIncident = (incident: AlertIncident, endedAt: Date) =>
  Effect.gen(function* () {
    const alertIncidentRepository = yield* AlertIncidentRepository
    yield* alertIncidentRepository.setEndedAt({ id: incident.id, endedAt })
  })
