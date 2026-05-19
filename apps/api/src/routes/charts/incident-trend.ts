import { incidentClosedPayloadSchema, incidentOpenedPayloadSchema, NotificationRepository } from "@domain/notifications"
import { NotificationId, OrganizationId } from "@domain/shared"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { NotificationRepositoryLive, type PostgresClient, withPostgres } from "@platform/db-postgres"
import { Effect } from "effect"
import type { Context } from "hono"
import { getAdminPostgresClient } from "../../clients.ts"
import type { AppEnv } from "../../types.ts"
import { renderIncidentTrendPng, TRANSPARENT_1x1_PNG } from "./render-incident-trend.tsx"

const PATH = "/charts/incident-trend"

/**
 * Long-lived cache so mail clients with image proxies (Gmail, etc.)
 * happily serve the same PNG to every subsequent open without
 * re-hitting the server.
 */
const PNG_CACHE_HEADER = "public, max-age=31536000, immutable" as const

const respondPng = (c: Context, buffer: Buffer) =>
  c.body(buffer as unknown as ArrayBuffer, 200, {
    "Content-Type": "image/png",
    "Cache-Control": PNG_CACHE_HEADER,
    "Content-Length": String(buffer.byteLength),
  })

const respondTransparent = (c: Context) => respondPng(c, TRANSPARENT_1x1_PNG)

/**
 * Public endpoint that serves the trend chart referenced from
 * notification emails. The endpoint is unauthenticated and identifies
 * rows by the raw `notificationId` (a CUID — ~128 bits of entropy,
 * not enumerable in practice). The chart payload is project-internal
 * trend data with no PII / credentials, so the cost of a leaked id is
 * bounded.
 *
 * TODO: if `notificationId` ever leaks to less-trusted surfaces, or
 * the rendered chart starts carrying more sensitive payloads, swap
 * the raw id for an HMAC-signed token here and a matching
 * `buildSignedChartUrl` helper on the email side. The threat model
 * shift is the trigger, not a routine concern.
 *
 * Failure modes degrade gracefully:
 * - Missing `nid` query param → 1×1 transparent PNG so the `<Img>`
 *   tag in the email still renders an element instead of an alt-text
 *   fallback.
 * - Notification row not found / kind has no trend → same fallback.
 *
 * The row is loaded via the admin Postgres client (RLS bypass) since
 * there's no organization context until the row is read.
 */
export const registerIncidentTrendChartRoute = ({
  app,
  adminDatabase,
}: {
  readonly app: OpenAPIHono<AppEnv>
  /** In production, defaults to the singleton; tests inject a PGlite-backed admin client. */
  readonly adminDatabase?: PostgresClient
}) => {
  app.get(PATH, async (c) => {
    const notificationIdRaw = c.req.query("nid")
    if (!notificationIdRaw) return respondTransparent(c)

    const notificationId = NotificationId(notificationIdRaw)
    const adminClient = adminDatabase ?? getAdminPostgresClient()

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
