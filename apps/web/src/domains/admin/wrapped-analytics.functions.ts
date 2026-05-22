import { WrappedReportRepository } from "@domain/spans"
import { WrappedReportRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"
import { buildAnalyticsPayload, type WrappedAnalyticsPayloadDto } from "./wrapped-analytics.ts"

/** Show reports from the last 7 days — the current week's window. */
const REPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Backoffice analytics for Claude Code Wrapped — feeds the
 * `/backoffice/wrapped` page. Loads the latest report per project created
 * within the last 7 days, runs the analytics rollup in memory, returns the
 * DTO. Single Postgres query + one in-memory pass; at platform scale
 * (hundreds of reports) this is sub-100ms.
 *
 * Admin-gated via `adminMiddleware`; the BYPASSRLS admin client is required
 * for the cross-org list (same constraint `getWrappedPageData` already
 * uses).
 */
export const adminListWrappedAnalytics = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async (): Promise<WrappedAnalyticsPayloadDto> => {
    const client = getAdminPostgresClient()
    const since = new Date(Date.now() - REPORT_WINDOW_MS)
    const records = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.listLatestPerProjectAdmin({ type: "claude_code", since })
      }).pipe(withPostgres(WrappedReportRepositoryLive, client), withTracing),
    )
    return buildAnalyticsPayload(records)
  })
