import { type AlertSeverity, alertSeveritySchema, meetsMinSeverity, type NotificationPreferences } from "@domain/shared"
import { groupOf, kindRequiresSeverity, type NotificationKind } from "./notification.ts"

/**
 * Resolves whether to send an email for a given notification kind, taking
 * the user's current preferences into account. Missing prefs default to
 * `true` — this is the opt-out model agreed at design time. When the
 * notification carries an incident `severity`, the group's optional
 * `emailMinSeverity` threshold applies progressively (e.g. `medium` admits
 * medium and high); a missing threshold admits everything.
 *
 * A signal escalating bypasses the threshold entirely — the caller decides that
 * with `isSignalEscalation` from `@domain/shared`, the same predicate a Slack
 * route uses, so the two channels cannot disagree. The group's email toggle
 * still wins over that — an off switch is not a threshold.
 *
 * `NotificationPreferences` itself lives in `@domain/shared` so that the
 * user entity can carry it without a circular dep on `@domain/notifications`.
 */
export const shouldSendEmail = (
  prefs: NotificationPreferences | null | undefined,
  kind: NotificationKind,
  severity?: AlertSeverity,
  options: { readonly isEscalation?: boolean } = {},
): boolean => {
  const channel = prefs?.[groupOf(kind)]
  // The group toggle is a hard off and outranks everything, escalation included:
  // it is the user saying "no email from this group", not a threshold.
  if (!(channel?.email ?? true)) return false
  // A signal escalating ignores the threshold, matching the Slack route rule so
  // the two channels cannot disagree about what an escalation is worth.
  if (options.isEscalation === true) return true
  // A kind that should carry a severity but has none is unjudged — an untriaged
  // signal, or one whose level was cleared — and is not emailed at all.
  if (severity === undefined) return !kindRequiresSeverity(kind)
  const minimum = channel?.emailMinSeverity
  if (!minimum) return true
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
