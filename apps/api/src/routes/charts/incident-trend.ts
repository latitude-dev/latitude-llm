import { incidentClosedPayloadSchema, incidentOpenedPayloadSchema, NotificationRepository } from "@domain/notifications"
import { NotificationId, OrganizationId } from "@domain/shared"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { NotificationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { verifySignedNotificationChartToken } from "@platform/storage-object"
import { Effect } from "effect"
import type { Context } from "hono"
import { getAdminPostgresClient } from "../../clients.ts"
import type { AppEnv } from "../../types.ts"
import { renderIncidentTrendPng, TRANSPARENT_1x1_PNG } from "./render-incident-trend.tsx"

const PATH = "/charts/incident-trend"

/**
 * Long-lived cache so mail clients with image proxies (Gmail, etc.)
 * happily serve the same PNG to every subsequent open without
 * re-hitting the server. Rotating `LAT_NOTIFICATION_CHART_SECRET`
 * invalidates every previously-signed URL.
 */
const PNG_CACHE_HEADER = "public, max-age=31536000, immutable" as const

const respondPng = (c: Context, buffer: Buffer) =>
  c.body(buffer as unknown as ArrayBuffer, 200, {
    "Content-Type": "image/png",
    "Cache-Control": PNG_CACHE_HEADER,
    "Content-Length": String(buffer.byteLength),
  })

const respondTransparent = (c: Context) => respondPng(c, TRANSPARENT_1x1_PNG)

const resolveSecret = (): string => Effect.runSync(parseEnv("LAT_NOTIFICATION_CHART_SECRET", "string"))

/**
 * Public endpoint that serves the trend chart referenced from
 * notification emails. Emails are sent to arbitrary recipients and may
 * be opened months after delivery, so the route can't rely on a session
 * — the URL's HMAC signature is the credential. Verification yields the
 * `notificationId`; the row is loaded via the admin Postgres client
 * (bypassing RLS, since the cred is the signature, not an org context).
 *
 * Failure modes degrade gracefully:
 * - Missing/tampered token → 401.
 * - Notification row not found / kind has no trend → 1×1 transparent
 *   PNG so the `<Img>` tag in the email still renders an element
 *   instead of an alt-text fallback.
 */
export const registerIncidentTrendChartRoute = ({ app }: { app: OpenAPIHono<AppEnv> }) => {
  app.get(PATH, async (c) => {
    const token = c.req.query("token")
    if (!token) return c.text("Missing token", 401)

    const secret = resolveSecret()
    const verification = await Effect.runPromise(
      verifySignedNotificationChartToken(token, secret).pipe(
        Effect.map((id) => ({ ok: true as const, id })),
        Effect.catchTag("SignedNotificationChartTokenError", () => Effect.succeed({ ok: false as const })),
      ),
    )
    if (!verification.ok) return c.text("Invalid token", 401)

    const notificationId = NotificationId(verification.id)
    const adminClient = getAdminPostgresClient()

    // Load the notification row. RLS is bypassed via the admin role on
    // `adminClient`; the system organizationId tells `SqlClient` not to
    // set `app.current_organization_id` for the transaction.
    const loaded = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        return yield* repo.findById(notificationId).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      }).pipe(withPostgres(NotificationRepositoryLive, adminClient, OrganizationId("system"))),
    )

    if (loaded === null) return respondTransparent(c)
    if (loaded.kind !== "incident.opened" && loaded.kind !== "incident.closed") return respondTransparent(c)

    const schema = loaded.kind === "incident.opened" ? incidentOpenedPayloadSchema : incidentClosedPayloadSchema
    const parsed = schema.safeParse(loaded.payload)
    if (!parsed.success) return respondTransparent(c)

    const breach = "breach" in parsed.data ? parsed.data.breach : undefined
    const png = await renderIncidentTrendPng({
      trend: parsed.data.trend,
      ...(breach ? { breach } : {}),
    })
    return respondPng(c, png)
  })
}
