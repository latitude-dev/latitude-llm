import {
  ALERT_SEVERITIES,
  type AlertSeverity,
  alertBaselineSchema,
  alertIncidentConditionSchema,
  alertIncidentIdSchema,
  alertSeveritySchema,
  cuidSchema,
  INCIDENT_SOURCE_TYPES,
  type IncidentSourceType,
  incidentSourceTypeSchema,
  organizationIdSchema,
  projectIdSchema,
} from "@domain/shared"
import { z } from "zod"

export {
  ALERT_SEVERITIES,
  type AlertSeverity,
  alertSeveritySchema,
  INCIDENT_SOURCE_TYPES,
  incidentSourceTypeSchema,
  type IncidentSourceType,
}

/**
 * Snapshot of the seasonal-anomaly signals captured at the moment a
 * signal escalation incident opens. Frozen on the row so the close-side
 * detector can compare against the conditions that tripped entry instead
 * of recomputing live (which would let the rolling baseline catch up to a
 * sustained incident and silently flip it closed).
 *
 * Field names mirror `SignalEscalationSignals` in `@domain/scores`. Kept as
 * a structural Zod schema rather than imported from there so `@domain/incidents`
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
 * Entry snapshot for a monitor `threshold` incident: the evaluated threshold frozen at
 * open time so the close-side compares against it rather than re-resolving a drifting
 * multiplier/seasonal baseline (which could auto-close a live breach). `baselineCount` +
 * `baseline` are multiplier-mode only.
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
export const isSignalEscalationEntrySignals = (signals: IncidentEntrySignals | null): signals is EntrySignalsSnapshot =>
  signals !== null && "expected1h" in signals

/** Narrow a stored snapshot to the saved-search shape — the sustained close-side reads its frozen threshold. */
export const isSavedSearchEntrySignals = (signals: IncidentEntrySignals | null): signals is SavedSearchEntrySignals =>
  signals !== null && "evaluatedThreshold" in signals

export const incidentSchema = z.object({
  id: alertIncidentIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sourceType: incidentSourceTypeSchema,
  sourceId: cuidSchema,
  severity: alertSeveritySchema,
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  createdAt: z.date(),
  entrySignals: incidentEntrySignalsSchema.nullable(),
  exitEligibleSince: z.date().nullable(),
  condition: alertIncidentConditionSchema.nullable().default(null),
})

export type Incident = z.infer<typeof incidentSchema>
