import { NotFoundError, WrappedReportId } from "@domain/shared"
import { type WrappedReportRecord, WrappedReportRepository, type WrappedReportType } from "@domain/spans"
import { WrappedReportRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { renderClaudeCodeOgImage } from "../../domains/wrapped/og/claude-code/render-og-image.tsx"
import { getAdminPostgresClient } from "../../server/clients.ts"

const logger = createLogger("wrapped.og")

/**
 * Per-type OG renderer dispatch. Today only `claude_code` is registered;
 * future Wrapped types add a sibling entry.
 */
const OG_RENDERER_BY_TYPE = {
  claude_code: renderClaudeCodeOgImage,
} as const satisfies Record<WrappedReportType, (record: WrappedReportRecord) => Promise<Buffer>>

/**
 * Dynamic OG card for a persisted Wrapped report.
 *
 * Resolves the row via the same admin Postgres client the page route
 * uses, dispatches to the type's renderer, and serves the 1200×630 PNG
 * with an `immutable` cache header — the underlying row never mutates so
 * the image never changes either.
 *
 * The `<meta property="og:image">` on the page route points at this URL.
 */
export const Route = createFileRoute("/wrapped/$id/og/png")({
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
          // NotFoundError → genuine 404. Anything else (DB outage, parse
          // failure, …) is a real error: log it and return 500 so the
          // failure is discoverable instead of masked behind a cached 404.
          if (cause instanceof NotFoundError) {
            return new Response("Not found", { status: 404 })
          }
          logger.error(`wrapped.og: lookup failed for ${params.id}`, cause)
          return new Response("Internal error", { status: 500 })
        }

        const renderer = OG_RENDERER_BY_TYPE[record.type] ?? OG_RENDERER_BY_TYPE.claude_code
        try {
          const png = await renderer(record)
          // biome-ignore lint/suspicious/noExplicitAny: Node Buffer is a valid BodyInit; TS lib types disagree.
          return new Response(png as any, {
            headers: {
              "Content-Type": "image/png",
              // The row + report blob are immutable; cache aggressively at the CDN.
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          })
        } catch (cause) {
          // Don't leak the underlying error message — render failures can
          // surface stack trace fragments, file paths, or dependency
          // versions, and this endpoint is unauthenticated. The full cause
          // already lands in the structured log.
          logger.error(`wrapped.og: render failed for ${params.id}`, cause)
          return new Response("Internal error", { status: 500 })
        }
      },
    },
  },
})
