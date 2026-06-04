import {
  ALERT_INCIDENT_KINDS,
  ALERT_INCIDENT_SOURCE_TYPES,
  ALERT_SEVERITIES,
  type AlertIncidentKind,
  type AlertIncidentSourceType,
  type AlertSeverity,
  alertBaselineSchema,
  alertIncidentConditionSchema,
  alertIncidentIdSchema,
  alertIncidentKindSchema,
  alertIncidentSourceTypeSchema,
  alertSeveritySchema,
  cuidSchema,
  monitorAlertIdSchema,
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

/**
 * Entry snapshot for a `savedSearch.escalating` incident: the threshold frozen at
 * open time so the close-side compares against it rather than re-resolving a
 * drifting baseline. `baselineCount` + `baseline` are multiplier-mode only.
 */
export const savedSearchEntrySignalsSchema = z.object({
  evaluatedThreshold: z.number(),
  baselineCount: z.number().optional(),
  baseline: alertBaselineSchema.optional(),
})

export type SavedSearchEntrySignals = z.infer<typeof savedSearchEntrySignalsSchema>

/** Polymorphic `entrySignals` (issue seasonal | saved-search frozen threshold), narrowed per-kind at the read site — the two shapes share no key. */
export const incidentEntrySignalsSchema = z.union([entrySignalsSnapshotSchema, savedSearchEntrySignalsSchema])

export type IncidentEntrySignals = z.infer<typeof incidentEntrySignalsSchema>

/** Narrow a stored snapshot to the issue-escalation shape — the only consumer of the seasonal scalars. */
export const isIssueEscalationEntrySignals = (signals: IncidentEntrySignals | null): signals is EntrySignalsSnapshot =>
  signals !== null && "expected1h" in signals

/** Narrow a stored snapshot to the saved-search shape — the sustained close-side reads its frozen threshold. */
export const isSavedSearchEntrySignals = (signals: IncidentEntrySignals | null): signals is SavedSearchEntrySignals =>
  signals !== null && "evaluatedThreshold" in signals

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
  entrySignals: incidentEntrySignalsSchema.nullable(),
  exitEligibleSince: z.date().nullable(),
  // Firing monitor alert; `null` on legacy/flag-off rows. `.default(null)` keeps pre-monitors `.parse` callers valid.
  monitorAlertId: monitorAlertIdSchema.nullable().default(null),
  // Condition snapshot frozen at open time; `null` for no-condition kinds.
  condition: alertIncidentConditionSchema.nullable().default(null),
})

export type AlertIncident = z.infer<typeof alertIncidentSchema>
