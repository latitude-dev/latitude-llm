import { ProjectId, projectIdSchema, WrappedReportId, wrappedReportIdSchema } from "@domain/shared"
import {
  WRAPPED_REPORT_TYPES,
  type WrappedReportRecord,
  WrappedReportRepository,
  type WrappedReportSummary,
  type WrappedReportType,
} from "@domain/spans"
import { WrappedReportRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getPostgresClient } from "../../server/clients.ts"

const byIdInputSchema = z.object({ id: wrappedReportIdSchema })

/**
 * Resolve a persisted Wrapped report by its public CUID. No auth — the
 * route is intentionally public, and the CUID is the only access control.
 * Uses the admin Postgres client (BYPASSRLS role) so cross-org reads
 * succeed; the share URL has no org context to route on.
 *
 * Returns the record on hit, `null` on miss. The route loader collapses
 * null → `notFound()`; any other error (DB outage, parse failure, …)
 * propagates as a 500 so it surfaces in logs.
 */
export const getWrappedReportById = createServerFn({ method: "GET" })
  .inputValidator(byIdInputSchema)
  .handler(async ({ data }): Promise<WrappedReportRecord | null> => {
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findById(WrappedReportId(data.id))
      }).pipe(
        Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
        withPostgres(WrappedReportRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )
  })

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const latestInputSchema = z.object({
  projectId: projectIdSchema,
  type: z.enum(WRAPPED_REPORT_TYPES).default("claude_code"),
})

/**
 * Returns the most recent Wrapped report id for the given project, but only
 * if it was generated within the past 7 days. Used by the project sidebar
 * to surface a shortcut to the current week's report.
 *
 * Runs under the session SqlClient (RLS scopes to the caller's org); the
 * project-id filter is the only explicit predicate. Returns `null` when no
 * fresh report exists — the sidebar hides the icon in that case.
 */
export const getLatestWrappedReportForProject = createServerFn({ method: "GET" })
  .inputValidator(latestInputSchema)
  .handler(async ({ data }): Promise<WrappedReportSummary | null> => {
    const { organizationId } = await requireSession()
    const sinceCreatedAt = new Date(Date.now() - SEVEN_DAYS_MS)
    const type: WrappedReportType = data.type
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findLatestForProject({ projectId: ProjectId(data.projectId), type, sinceCreatedAt })
      }).pipe(withPostgres(WrappedReportRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )
  })
