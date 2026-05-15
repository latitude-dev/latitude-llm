import { MembershipRepository } from "@domain/organizations"
import {
  OrganizationId,
  ProjectId,
  projectIdSchema,
  UserId,
  WrappedReportId,
  wrappedReportIdSchema,
} from "@domain/shared"
import {
  WRAPPED_REPORT_TYPES,
  type WrappedReportRecord,
  WrappedReportRepository,
  type WrappedReportSummary,
  type WrappedReportType,
} from "@domain/spans"
import { MembershipRepositoryLive, WrappedReportRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getPostgresClient } from "../../server/clients.ts"
import { getSession } from "../sessions/session.functions.ts"

const byIdInputSchema = z.object({ id: wrappedReportIdSchema })

/**
 * Server-side redaction for non-member viewers of the public Wrapped page.
 *
 * The Wrapped record carries org-internal details (workspace names, file
 * paths, branch names, top bash command) that shouldn't reach viewers
 * outside the wrapped's organization. This helper rewrites the report
 * blob into a "summary only" shape before the data ever crosses the
 * wire — defence-in-depth on top of the dual-layout rendering on the
 * client so a rendering bug can't leak private fields.
 *
 * Fields zeroed out:
 *   - moments.longestSession.workspace → null
 *   - moments.biggestWrite.displayName → "" (schema requires string)
 *   - topBashCommand → null
 *   - workspaceDeepDives → []
 *   - otherWorkspaceCount → 0
 *
 * Everything else (counts, owner name, project name, heatmap, personality)
 * stays — those fields are public-safe by design.
 */
const redactForPublic = (record: WrappedReportRecord): WrappedReportRecord => ({
  ...record,
  report: {
    ...record.report,
    topBashCommand: null,
    workspaceDeepDives: [],
    otherWorkspaceCount: 0,
    moments: {
      ...record.report.moments,
      longestSession: record.report.moments.longestSession
        ? { ...record.report.moments.longestSession, workspace: null }
        : null,
      biggestWrite: record.report.moments.biggestWrite
        ? { ...record.report.moments.biggestWrite, displayName: "" }
        : null,
    },
  },
})

type WrappedPageData =
  | { readonly found: false }
  | {
      readonly found: true
      /** Full record for members; redacted for non-members. */
      readonly record: WrappedReportRecord
      /** True iff the viewer is logged in AND belongs to the wrapped's org. */
      readonly isMember: boolean
      readonly loggedIn: boolean
    }

/**
 * Single endpoint the public `/wrapped/$id` route hits — bundles the
 * record lookup, viewer auth, and org-membership check so the loader is
 * one round-trip. Non-member viewers receive a redacted record (see
 * `redactForPublic`); members receive the full record.
 *
 * Same admin-client + system-org pattern `getWrappedReportById` uses
 * (the route is public, no org context in the URL).
 */
export const getWrappedPageData = createServerFn({ method: "GET" })
  .inputValidator(byIdInputSchema)
  .handler(async ({ data }): Promise<WrappedPageData> => {
    const adminClient = getAdminPostgresClient()

    const record = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findById(WrappedReportId(data.id))
      }).pipe(
        Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
        withPostgres(WrappedReportRepositoryLive, adminClient),
        withTracing,
      ),
    )
    if (!record) return { found: false }

    const session = await getSession()
    const userId = session?.user?.id ?? null

    let isMember = false
    if (userId !== null) {
      isMember = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* MembershipRepository
          return yield* repo.isMember(OrganizationId(record.organizationId), UserId(userId))
        }).pipe(withPostgres(MembershipRepositoryLive, adminClient), withTracing),
      )
    }

    return {
      found: true,
      record: isMember ? record : redactForPublic(record),
      isMember,
      loggedIn: userId !== null,
    }
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
