import { createSignedNotificationChartToken } from "@platform/storage-object"
import { Effect } from "effect"

/**
 * Build the absolute URL that emails embed via `<Img src={...}>` to
 * pull the per-notification incident-trend chart from `apps/api`. The
 * URL is HMAC-signed with `LAT_NOTIFICATION_CHART_SECRET` so the API
 * route can verify it without needing a session — emails are sent to
 * arbitrary recipients and may sit in inboxes for months before being
 * opened.
 *
 * Token shape: `${notificationIdB64url}.${sigB64url}`. No expiry on
 * the payload — rotating the secret is the kill switch.
 */
export const buildSignedChartUrl = (input: {
  readonly notificationId: string
  readonly apiBaseUrl: string
  readonly secret: string
}): Effect.Effect<string> =>
  Effect.promise(() => createSignedNotificationChartToken(input.notificationId, input.secret)).pipe(
    Effect.map((token) => {
      const base = input.apiBaseUrl.replace(/\/$/, "")
      return `${base}/charts/incident-trend?token=${encodeURIComponent(token)}`
    }),
  )
