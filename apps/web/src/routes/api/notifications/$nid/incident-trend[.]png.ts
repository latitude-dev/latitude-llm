import { incidentClosedPayloadSchema, incidentOpenedPayloadSchema, NotificationRepository } from "@domain/notifications"
import { NotificationId, OrganizationId } from "@domain/shared"
import { NotificationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import {
  renderIncidentTrendPng,
  TRANSPARENT_1x1_PNG,
} from "../../../../domains/notifications/email-chart/render-incident-trend.tsx"
import { getAdminPostgresClient } from "../../../../server/clients.ts"

const logger = createLogger("charts.incident-trend")

/**
 * Long-lived cache so mail clients with image proxies (Gmail, etc.)
 * happily serve the same PNG to every subsequent open without
 * re-hitting the server.
 */
const PNG_CACHE_HEADER = "public, max-age=31536000, immutable" as const

const respondPng = (buffer: Buffer): Response =>
  // biome-ignore lint/suspicious/noExplicitAny: Node Buffer is a valid BodyInit; TS lib types disagree.
  new Response(buffer as any, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": PNG_CACHE_HEADER,
      "Content-Length": String(buffer.byteLength),
    },
  })

const respondTransparent = (): Response => respondPng(TRANSPARENT_1x1_PNG)

/**
 * Per-notification incident-trend chart referenced from sustained-incident
 * emails (`incident.opened` / `incident.closed`). The route is
 * unauthenticated and identifies rows by the raw `notificationId` (a CUID
 * — ~128 bits of entropy, not enumerable in practice). The chart payload
 * is project-internal trend data with no PII / credentials, so the cost
 * of a leaked id is bounded.
 *
 * Mounted in `apps/web` (not `apps/api`) so the public + MCP surface stays
 * limited to authenticated endpoints. The `/api/` prefix matches the
 * project's convention for machine-facing routes that sit next to
 * user-facing pages (`apps/web/src/routes/api/health.ts`, `…/api/auth/…`),
 * and reuses the satori + resvg pipeline already running for the wrapped
 * OG card.
 *
 * Failure modes degrade gracefully:
 * - Missing or unparseable `nid` path param → 1×1 transparent PNG so the
 *   `<Img>` tag in the email still renders an element instead of an
 *   alt-text fallback.
 * - Notification row not found / kind has no trend → same fallback.
 * - Render failure (font CDN timeout, satori throw, resvg panic) → same
 *   fallback. A broken image in the recipient's inbox is worse than a
 *   missing one.
 *
 * The row is loaded via the admin Postgres client (RLS bypass) since
 * there's no organization context until the row is read.
 */
export const Route = createFileRoute("/api/notifications/$nid/incident-trend.png")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { nid: string } }) => {
        if (!params.nid) return respondTransparent()

        const notificationId = NotificationId(params.nid)
        const adminClient = getAdminPostgresClient()

        const loaded = await Effect.runPromise(
          Effect.gen(function* () {
            const repo = yield* NotificationRepository
            return yield* repo
              .findById(notificationId)
              .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
          }).pipe(withPostgres(NotificationRepositoryLive, adminClient, OrganizationId("system")), withTracing),
        )

        if (loaded === null) return respondTransparent()
        if (loaded.kind !== "incident.opened" && loaded.kind !== "incident.closed") return respondTransparent()

        const schema = loaded.kind === "incident.opened" ? incidentOpenedPayloadSchema : incidentClosedPayloadSchema
        const parsed = schema.safeParse(loaded.payload)
        if (!parsed.success) return respondTransparent()

        // No trend snapshot → nothing to chart (e.g. saved-search incidents carry no issue trend).
        const trend = parsed.data.trend
        if (!trend) return respondTransparent()

        const breach = "breach" in parsed.data ? parsed.data.breach : undefined
        try {
          const png = await renderIncidentTrendPng({
            trend,
            ...(breach ? { breach } : {}),
          })
          return respondPng(png)
        } catch (cause) {
          logger.error(`charts.incident-trend: render failed for ${params.nid}`, cause)
          return respondTransparent()
        }
      },
    },
  },
})
