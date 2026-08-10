import { z } from "zod"

export const MONITOR_TARGET_TYPES = ["savedSearch", "tool", "user", "session"] as const
export const monitorTargetTypeSchema = z.enum(MONITOR_TARGET_TYPES)
export type MonitorTargetType = z.infer<typeof monitorTargetTypeSchema>

export const MONITOR_TRIGGERS = ["match", "threshold", "escalating"] as const
export const monitorTriggerSchema = z.enum(MONITOR_TRIGGERS)
export type MonitorTrigger = z.infer<typeof monitorTriggerSchema>

export const INCIDENT_SOURCE_TYPES = ["monitor", "signal"] as const
export const incidentSourceTypeSchema = z.enum(INCIDENT_SOURCE_TYPES)
export type IncidentSourceType = z.infer<typeof incidentSourceTypeSchema>

/**
 * A signal-sourced incident, i.e. a signal escalating.
 *
 * Such a notification ignores both severity thresholds — the Slack route's
 * `minSeverity` and the user's `emailMinSeverity`. The signal's level says how
 * bad the pattern is; escalating says its rate just broke its own seasonal band,
 * and a severity threshold was not set to answer the second. 97% of production
 * escalations come from signals nobody has triaged, so honouring either
 * threshold silences nearly all of them. Monitor incidents keep both.
 *
 * Lives here rather than in either channel so the two cannot drift apart.
 */
export const isSignalEscalation = (payload: Record<string, unknown>): boolean => payload.sourceType === "signal"

/**
 * The one severity scale, ascending. Shared with signals, whose `priority`
 * column holds the same values under a different field name (kept because
 * `priority` is public API and `severity` is the key inside every stored
 * notification payload — see `@domain/signals` `SIGNAL_PRIORITIES`).
 */
export const ALERT_SEVERITIES = ["low", "medium", "high", "urgent"] as const
export const alertSeveritySchema = z.enum(ALERT_SEVERITIES)
export type AlertSeverity = z.infer<typeof alertSeveritySchema>

export const SIGNAL_INCIDENT_TRIGGERS = ["escalating"] as const
export const INCIDENT_NOTIFICATION_KEYS = [
  "signal.escalating",
  "monitor.match",
  "monitor.threshold",
  "monitor.escalating",
] as const
export const incidentNotificationKeySchema = z.enum(INCIDENT_NOTIFICATION_KEYS)
export type IncidentNotificationKey = z.infer<typeof incidentNotificationKeySchema>

export const INCIDENT_NOTIFICATION_KEY_LABEL: Record<IncidentNotificationKey, string> = {
  "signal.escalating": "Signal escalating",
  "monitor.match": "Monitor match",
  "monitor.threshold": "Monitor threshold",
  "monitor.escalating": "Monitor escalating",
}
export const DEFAULT_SEVERITY_FOR_INCIDENT_NOTIFICATION_KEY: Record<IncidentNotificationKey, AlertSeverity> = {
  "signal.escalating": "high",
  "monitor.match": "medium",
  "monitor.threshold": "medium",
  "monitor.escalating": "high",
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { low: 0, medium: 1, high: 2, urgent: 3 }

export const meetsMinSeverity = (severity: AlertSeverity, minimum: AlertSeverity): boolean =>
  SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum]

export const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  low: "#3b82f6",
  medium: "#f59e0b",
  high: "#ef4444",
  urgent: "#b91c1c",
}

export const SEVERITY_BADGE_COLOR: Record<AlertSeverity, { readonly background: string; readonly foreground: string }> =
  {
    low: { background: "#dbeafe", foreground: "#1e40af" },
    medium: { background: "#fef3c7", foreground: "#92400e" },
    high: { background: "#fee2e2", foreground: "#991b1b" },
    urgent: { background: "#fecaca", foreground: "#7f1d1d" },
  }
