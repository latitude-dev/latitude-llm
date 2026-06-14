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
  // ── LEGACY · issue.* — system, event-driven (fired from @domain/issues). Folded into
  //    the unified model with the signals migration; not user-creatable.
  "issue.new",
  "issue.regressed",
  "issue.escalating",
  // ── LEGACY · savedSearch.* — saved-search-only, target carried on the alert's
  //    (sourceType, sourceId). SUPERSEDED by the unified kinds below; kept only until
  //    existing saved-search monitors are migrated off them (then removed — breaking SDK).
  "savedSearch.match",
  "savedSearch.threshold",
  "savedSearch.escalating",
  // ── UNIFIED · query-time kinds. Target lives on the MONITOR ({stream, filterSet, metric}),
  //    not on the alert source. Used by tool / user / raw-stream monitors.
  "event.matched", // ← supersedes savedSearch.match
  "metric.threshold", // ← supersedes savedSearch.threshold
  "metric.escalating", // ← supersedes savedSearch.escalating
] as const
export const alertIncidentKindSchema = z.enum(ALERT_INCIDENT_KINDS)
export type AlertIncidentKind = z.infer<typeof alertIncidentKindSchema>

/**
 * Legal source type for the LEGACY source-based kinds; create/update reject mismatches.
 * UNIFIED kinds (`event.matched` / `metric.*`) carry their target on the monitor — not a
 * `(sourceType, sourceId)` on the alert — so they are intentionally absent (lookups return
 * `undefined`, and callers treat that as "target lives on the monitor").
 */
export const ALERT_INCIDENT_KIND_SOURCE_TYPE: Partial<Record<AlertIncidentKind, AlertIncidentSourceType>> = {
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
  "event.matched": "point",
  "metric.threshold": "point",
  "metric.escalating": "sustained",
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
  "event.matched": "New match",
  "metric.threshold": "Metric threshold",
  "metric.escalating": "Metric escalating",
}

/**
 * Kinds users may put on their own monitors; `issue.*` are system-only. Create/update enforce this.
 * Still the LEGACY saved-search kinds — the unified `event.matched` / `metric.*` kinds become
 * user-creatable once target-on-monitor creation lands (they take a monitor target, not a source).
 */
export const USER_CREATABLE_ALERT_KINDS = [
  "savedSearch.match",
  "savedSearch.threshold",
  "savedSearch.escalating",
] as const satisfies readonly AlertIncidentKind[]

export const ALERT_SEVERITIES = ["low", "medium", "high"] as const
export const alertSeveritySchema = z.enum(ALERT_SEVERITIES)
export type AlertSeverity = z.infer<typeof alertSeveritySchema>

const SEVERITY_RANK: Record<AlertSeverity, number> = { low: 0, medium: 1, high: 2 }

/**
 * Progressive threshold check used by delivery filters: a `minimum` of
 * `medium` admits medium and high incidents, `low` admits everything.
 */
export const meetsMinSeverity = (severity: AlertSeverity, minimum: AlertSeverity): boolean =>
  SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum]

/**
 * Canonical severity palette (Tailwind-500 blue/amber/red). Single source of
 * truth for every surface that color-codes severity: web chart markers, the
 * server-rendered incident-trend PNG, Slack attachment bars and email badges.
 */
export const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  low: "#3b82f6",
  medium: "#f59e0b",
  high: "#ef4444",
}

/**
 * Light-background/dark-foreground pairs (Tailwind 100/800 of the same hues as
 * {@link SEVERITY_COLOR}) for badge-style rendering, e.g. the email severity pill.
 */
export const SEVERITY_BADGE_COLOR: Record<AlertSeverity, { readonly background: string; readonly foreground: string }> =
  {
    low: { background: "#dbeafe", foreground: "#1e40af" },
    medium: { background: "#fef3c7", foreground: "#92400e" },
    high: { background: "#fee2e2", foreground: "#991b1b" },
  }

/** Legacy (flag-off) issue-event severity. Flag-on reads severity off the firing alert instead. */
export const SEVERITY_FOR_KIND: Record<AlertIncidentKind, AlertSeverity> = {
  "issue.new": "medium",
  "issue.regressed": "high",
  "issue.escalating": "high",
  "savedSearch.match": "low",
  "savedSearch.threshold": "medium",
  "savedSearch.escalating": "high",
  "event.matched": "low",
  "metric.threshold": "medium",
  "metric.escalating": "high",
}
