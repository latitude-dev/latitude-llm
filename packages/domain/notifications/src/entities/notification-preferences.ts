import type { NotificationPreferences } from "@domain/shared"
import { groupOf, type NotificationKind } from "./notification.ts"

/**
 * Resolves whether to send an email for a given notification kind, taking
 * the user's current preferences into account. Missing prefs default to
 * `true` — this is the opt-out model agreed at design time.
 *
 * `NotificationPreferences` itself lives in `@domain/shared` so that the
 * user entity can carry it without a circular dep on `@domain/notifications`.
 */
export const shouldSendEmail = (prefs: NotificationPreferences | null | undefined, kind: NotificationKind): boolean =>
  prefs?.[groupOf(kind)]?.email ?? true
