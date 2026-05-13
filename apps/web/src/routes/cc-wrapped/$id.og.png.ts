import { NotFoundError, WrappedReportId } from "@domain/shared"
import { type WrappedReportRecord, WrappedReportRepository } from "@domain/spans"
import { WrappedReportRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { renderWrappedOgImage } from "../../domains/cc-wrapped/og/render-og-image.tsx"
import { getAdminPostgresClient } from "../../server/clients.ts"

const logger = createLogger("cc-wrapped.og")

/**
 * Dynamic OG card for a persisted Wrapped report.
 *
 * Resolves the row via the same admin Postgres client the page route uses,
 * renders a 1200×630 PNG via Satori + Resvg, and serves it with an
 * `immutable` cache header — the underlying row never mutates so the image
 * never changes either.
 *
 * The `<meta property="og:image">` on the page route points at this URL.
 */
export const Route = createFileRoute("/cc-wrapped/$id/og/png")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        let record: WrappedReportRecord
        try {
          record = await Effect.runPromise(
            Effect.gen(function* () {
              const repo = yield* WrappedReportRepository
              return yield* repo.findById(WrappedReportId(params.id))
            }).pipe(withPostgres(WrappedReportRepositoryLive, getAdminPostgresClient()), withTracing),
          )
        } catch (cause) {
          // NotFoundError → genuine 404. Anything else is unexpected and
          // worth surfacing in logs.
          if (!(cause instanceof NotFoundError)) {
            logger.error(`cc-wrapped.og: lookup failed for ${params.id}`, cause)
          }
          return new Response("Not found", { status: 404 })
        }

        try {
          const png = await renderWrappedOgImage(record)
          // biome-ignore lint/suspicious/noExplicitAny: Node Buffer is a valid BodyInit; TS lib types disagree.
          return new Response(png as any, {
            headers: {
              "Content-Type": "image/png",
              // The row + report blob are immutable; cache aggressively at the CDN.
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          })
        } catch (cause) {
          logger.error(`cc-wrapped.og: render failed for ${params.id}`, cause)
          const message = cause instanceof Error ? cause.message : String(cause)
          return new Response(`OG render failed: ${message}`, { status: 500 })
        }
      },
    },
  },
})
