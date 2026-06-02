import { z } from "zod"

/** Entity an alert watches: `(sourceType, sourceId)` identifies the incident's subject. */
export const ALERT_INCIDENT_SOURCE_TYPES = ["issue", "savedSearch"] as const
export const alertIncidentSourceTypeSchema = z.enum(ALERT_INCIDENT_SOURCE_TYPES)
export type AlertIncidentSourceType = z.infer<typeof alertIncidentSourceTypeSchema>

/**
 * The watched signal. Lives in `@domain/shared` (not `@domain/alerts`) so
 * notifications / monitors / project settings can key off it without depending
 * on the alerts package.
 */
export const ALERT_INCIDENT_KINDS = [
  "issue.new",
  "issue.regressed",
  "issue.escalating",
  "savedSearch.match",
  "savedSearch.threshold",
  "savedSearch.escalating",
] as const
export const alertIncidentKindSchema = z.enum(ALERT_INCIDENT_KINDS)
export type AlertIncidentKind = z.infer<typeof alertIncidentKindSchema>

/** Each kind has exactly one legal source type; create/update reject mismatches. */
export const ALERT_INCIDENT_KIND_SOURCE_TYPE: Record<AlertIncidentKind, AlertIncidentSourceType> = {
  "issue.new": "issue",
  "issue.regressed": "issue",
  "issue.escalating": "issue",
  "savedSearch.match": "savedSearch",
  "savedSearch.threshold": "savedSearch",
  "savedSearch.escalating": "savedSearch",
}

/** Point (start == end) vs sustained (needs closing). Drives `endedAt` writes + notification kinds. */
export const ALERT_INCIDENT_KIND_LIFECYCLE: Record<AlertIncidentKind, "point" | "sustained"> = {
  "issue.new": "point",
  "issue.regressed": "point",
  "issue.escalating": "sustained",
  "savedSearch.match": "point",
  "savedSearch.threshold": "point",
  "savedSearch.escalating": "sustained",
}

/**
 * Canonical human-readable label per kind. Single source of truth — the monitor
 * panel, incident-chart markers, and email/Slack notification templates all read
 * this so the same kind never shows two different names.
 */
export const ALERT_INCIDENT_KIND_LABEL: Record<AlertIncidentKind, string> = {
  "issue.new": "Issue discovered",
  "issue.regressed": "Issue regressed",
  "issue.escalating": "Issue escalating",
  "savedSearch.match": "Search match",
  "savedSearch.threshold": "Search threshold",
  "savedSearch.escalating": "Search escalating",
}

/** Kinds users may put on their own monitors; `issue.*` are system-only. Create/update enforce this. */
export const USER_CREATABLE_ALERT_KINDS = [
  "savedSearch.match",
  "savedSearch.threshold",
  "savedSearch.escalating",
] as const satisfies readonly AlertIncidentKind[]

export const ALERT_SEVERITIES = ["low", "medium", "high"] as const
export const alertSeveritySchema = z.enum(ALERT_SEVERITIES)
export type AlertSeverity = z.infer<typeof alertSeveritySchema>

/** Legacy (flag-off) issue-event severity. Flag-on reads severity off the firing alert instead. */
export const SEVERITY_FOR_KIND: Record<AlertIncidentKind, AlertSeverity> = {
  "issue.new": "medium",
  "issue.regressed": "high",
  "issue.escalating": "high",
  "savedSearch.match": "low",
  "savedSearch.threshold": "medium",
  "savedSearch.escalating": "high",
}
