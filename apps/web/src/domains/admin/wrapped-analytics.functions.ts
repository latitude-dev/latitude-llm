import { WrappedReportRepository } from "@domain/spans"
import { WrappedReportRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"
import { buildAnalyticsPayload, type WrappedAnalyticsPayloadDto } from "./wrapped-analytics.ts"

/**
 * Cohort cutoff: only include reports created at least this long ago. Keeps
 * fresh-from-the-worker (or manually re-triggered) reports out of the
 * analytics window so the cohort represents stable, "shipped" output.
 */
const MIN_REPORT_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Backoffice analytics for Claude Code Wrapped — feeds the
 * `/backoffice/wrapped` page. Loads the latest report per project (where
 * that latest is at least 7 days old), runs the analytics rollup in
 * memory, returns the DTO. Single Postgres query + one in-memory pass; at
 * platform scale (hundreds of reports) this is sub-100ms.
 *
 * Admin-gated via `adminMiddleware`; the BYPASSRLS admin client is required
 * for the cross-org list (same constraint `getWrappedPageData` already
 * uses).
 */
export const adminListWrappedAnalytics = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async (): Promise<WrappedAnalyticsPayloadDto> => {
    const client = getAdminPostgresClient()
    const olderThan = new Date(Date.now() - MIN_REPORT_AGE_MS)
    const records = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.listLatestPerProjectAdmin({ type: "claude_code", olderThan })
      }).pipe(withPostgres(WrappedReportRepositoryLive, client), withTracing),
    )
    return buildAnalyticsPayload(records)
  })
