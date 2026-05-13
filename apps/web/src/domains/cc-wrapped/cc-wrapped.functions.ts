import { ProjectId, projectIdSchema, WrappedReportId, wrappedReportIdSchema } from "@domain/shared"
import { type WrappedReportRecord, WrappedReportRepository, type WrappedReportSummary } from "@domain/spans"
import { WrappedReportRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getPostgresClient } from "../../server/clients.ts"

const byIdInputSchema = z.object({ id: wrappedReportIdSchema })

/**
 * Resolve a persisted Claude Code Wrapped report by its public CUID. No auth
 * — the route is intentionally public, and the CUID is the only access
 * control. Uses the admin Postgres client with the "system" org sentinel so
 * RLS is bypassed (the CUID doesn't carry org context).
 *
 * Returns the full record (the loader passes it to the version-scoped
 * renderer); throws on miss (TanStack's route loader turns this into a 404
 * via the route's `errorComponent`).
 */
export const getWrappedReportById = createServerFn({ method: "GET" })
  .inputValidator(byIdInputSchema)
  .handler(async ({ data }): Promise<WrappedReportRecord> => {
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findById(WrappedReportId(data.id))
      }).pipe(withPostgres(WrappedReportRepositoryLive, getAdminPostgresClient()), withTracing),
    )
  })

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const latestInputSchema = z.object({ projectId: projectIdSchema })

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
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findLatestForProject({ projectId: ProjectId(data.projectId), sinceCreatedAt })
      }).pipe(withPostgres(WrappedReportRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )
  })
