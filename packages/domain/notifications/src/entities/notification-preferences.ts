import {
  type AlertSeverity,
  admitsTopic,
  alertSeveritySchema,
  meetsMinSeverity,
  type NotificationPreferences,
} from "@domain/shared"
import { type NotificationKind, routeOf } from "./notification.ts"

/**
 * Resolves whether to send an email for a given notification, taking the
 * user's current preferences into account. Missing prefs default to `true`
 * — this is the opt-out model agreed at design time. Three gates apply in
 * order: the group's own switch, the per-topic switch for groups that have
 * sub-toggles, and the group's optional `emailMinSeverity` threshold, which
 * applies progressively (e.g. `medium` admits medium and high) to payloads
 * that carry a severity.
 *
 * `NotificationPreferences` itself lives in `@domain/shared` so that the
 * user entity can carry it without a circular dep on `@domain/notifications`.
 */
export const shouldSendEmail = (
  prefs: NotificationPreferences | null | undefined,
  kind: NotificationKind,
  payload: Record<string, unknown>,
): boolean => {
  const { group, topic } = routeOf(kind, payload)
  const channel = prefs?.[group]
  if (!(channel?.email ?? true)) return false
  if (!admitsTopic(channel?.emailTopics, topic)) return false
  const minimum = channel?.emailMinSeverity
  const severity = severityFromPayload(payload)
  if (!minimum || severity === undefined) return true
  return meetsMinSeverity(severity, minimum)
}

/**
 * Extracts the incident severity a notification payload carries, if any.
 * Incident payloads (`incident.*` kinds) always include `severity`; other
 * kinds (wrapped reports, announcements) return `undefined` and are never
 * severity-filtered.
 */
const severityFromPayload = (payload: Record<string, unknown>): AlertSeverity | undefined => {
  const parsed = alertSeveritySchema.safeParse(payload.severity)
  return parsed.success ? parsed.data : undefined
}
