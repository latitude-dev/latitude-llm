import {
  ALERT_INCIDENT_KINDS,
  ALERT_INCIDENT_SOURCE_TYPES,
  ALERT_SEVERITIES,
  type AlertIncidentKind,
  type AlertIncidentSourceType,
  type AlertSeverity,
  alertIncidentIdSchema,
  alertIncidentKindSchema,
  alertIncidentSourceTypeSchema,
  alertSeveritySchema,
  cuidSchema,
  organizationIdSchema,
  projectIdSchema,
  SEVERITY_FOR_KIND,
} from "@domain/shared"
import { z } from "zod"

// Re-export the alert-kind / severity primitives that used to live here so
// existing `@domain/alerts` consumers keep working unchanged. The canonical
// declarations now live in `@domain/shared` so non-alert domains (notifications,
// project settings) can key off them without depending on `@domain/alerts`.
export {
  ALERT_INCIDENT_KINDS,
  ALERT_INCIDENT_SOURCE_TYPES,
  ALERT_SEVERITIES,
  alertIncidentKindSchema,
  type AlertIncidentKind,
  alertIncidentSourceTypeSchema,
  type AlertIncidentSourceType,
  type AlertSeverity,
  alertSeveritySchema,
  SEVERITY_FOR_KIND,
}

/**
 * Snapshot of the seasonal-anomaly signals captured at the moment an
 * `issue.escalating` incident opens. Frozen on the row so the close-side
 * detector can compare against the conditions that tripped entry instead
 * of recomputing live (which would let the rolling baseline catch up to a
 * sustained incident and silently flip it closed).
 *
 * Field names mirror `IssueEscalationSignals` in `@domain/scores`. Kept as
 * a structural Zod schema rather than imported from there so `@domain/alerts`
 * stays free of a `@domain/scores` dependency — the snapshot is a value
 * type on this entity, not a behaviour pulled from the analytics port.
 *
 * Nullable on the row for incidents opened before this column was added;
 * the helper treats `null` snapshots as legacy (skips the absolute-rate
 * backstop, still honours band-shape exit and the 72h timeout).
 */
export const entrySignalsSnapshotSchema = z.object({
  expected1h: z.number(),
  expected6hPerHour: z.number(),
  stddev1h: z.number(),
  stddev6hPerHour: z.number(),
  kShort: z.number(),
  kLong: z.number(),
  entryThreshold1h: z.number(),
  entryThreshold6hPerHour: z.number(),
  entryCount24h: z.number(),
})

export type EntrySignalsSnapshot = z.infer<typeof entrySignalsSnapshotSchema>

export const alertIncidentSchema = z.object({
  id: alertIncidentIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sourceType: alertIncidentSourceTypeSchema,
  sourceId: cuidSchema, // V1 sources are issues; widen if future sources need other id shapes
  kind: alertIncidentKindSchema,
  severity: alertSeveritySchema,
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  createdAt: z.date(),
  entrySignals: entrySignalsSnapshotSchema.nullable(),
  exitEligibleSince: z.date().nullable(),
})

export type AlertIncident = z.infer<typeof alertIncidentSchema>
