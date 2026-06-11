import { type AlertSeverity, alertSeveritySchema, meetsMinSeverity, type NotificationPreferences } from "@domain/shared"
import { groupOf, type NotificationKind } from "./notification.ts"

/**
 * Resolves whether to send an email for a given notification kind, taking
 * the user's current preferences into account. Missing prefs default to
 * `true` — this is the opt-out model agreed at design time. When the
 * notification carries an incident `severity`, the group's optional
 * `emailMinSeverity` threshold applies progressively (e.g. `medium` admits
 * medium and high); a missing threshold admits everything.
 *
 * `NotificationPreferences` itself lives in `@domain/shared` so that the
 * user entity can carry it without a circular dep on `@domain/notifications`.
 */
export const shouldSendEmail = (
  prefs: NotificationPreferences | null | undefined,
  kind: NotificationKind,
  severity?: AlertSeverity,
): boolean => {
  const channel = prefs?.[groupOf(kind)]
  if (!(channel?.email ?? true)) return false
  const minimum = channel?.emailMinSeverity
  if (!minimum || severity === undefined) return true
  return meetsMinSeverity(severity, minimum)
}

/**
 * Extracts the incident severity a notification payload carries, if any.
 * Incident payloads (`incident.*` kinds) always include `severity`; other
 * kinds (wrapped reports, announcements) return `undefined` and are never
 * severity-filtered.
 */
export const severityFromPayload = (payload: Record<string, unknown>): AlertSeverity | undefined => {
  const parsed = alertSeveritySchema.safeParse(payload.severity)
  return parsed.success ? parsed.data : undefined
}
