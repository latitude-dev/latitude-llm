import { WrappedReportId, wrappedReportIdSchema } from "@domain/shared"
import { type WrappedReportRecord, WrappedReportRepository } from "@domain/spans"
import { WrappedReportRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getAdminPostgresClient } from "../../server/clients.ts"

const inputSchema = z.object({ id: wrappedReportIdSchema })

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
  .inputValidator(inputSchema)
  .handler(async ({ data }): Promise<WrappedReportRecord> => {
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findById(WrappedReportId(data.id))
      }).pipe(withPostgres(WrappedReportRepositoryLive, getAdminPostgresClient()), withTracing),
    )
  })
