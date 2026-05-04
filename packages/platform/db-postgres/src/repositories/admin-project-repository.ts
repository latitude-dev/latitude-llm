import {
  type AdminProjectDetails,
  AdminProjectRepository,
  type ProjectIssueDetails,
  type ProjectIssueLifecycleEvent,
  type ProjectIssueStateSnapshot,
} from "@domain/admin"
import {
  IssueId,
  NotFoundError,
  type ProjectId,
  type ProjectSettings,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, eq, exists, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { organizations } from "../schema/better-auth.ts"
import { evaluations } from "../schema/evaluations.ts"
import { issues } from "../schema/issues.ts"
import { projects } from "../schema/projects.ts"

/**
 * Live layer for the backoffice project-detail port.
 *
 * ⚠️ SECURITY: queries run **without** an `organization_id` filter and
 * see every project in the database. Only safe when the SqlClient was
 * constructed with `OrganizationId("system")` (the default on
 * `getAdminPostgresClient()`) so RLS is bypassed. Never provide this
 * layer on the standard app-facing Postgres client.
 *
 * Soft-deleted projects (`deletedAt IS NOT NULL`) are excluded — the
 * backoffice deliberately doesn't surface them in v1, matching the
 * search-results filter. If staff need to inspect a deleted project,
 * we'll either restore it or add an explicit toggle later.
 */
export const AdminProjectRepositoryLive = Layer.effect(
  AdminProjectRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (projectId: ProjectId) =>
        Effect.gen(function* () {
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: projects.id,
                name: projects.name,
                slug: projects.slug,
                settings: projects.settings,
                firstTraceAt: projects.firstTraceAt,
                lastEditedAt: projects.lastEditedAt,
                deletedAt: projects.deletedAt,
                createdAt: projects.createdAt,
                updatedAt: projects.updatedAt,
                organizationId: organizations.id,
                organizationName: organizations.name,
                organizationSlug: organizations.slug,
              })
              .from(projects)
              .innerJoin(organizations, eq(projects.organizationId, organizations.id))
              .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
              .limit(1),
          )
          const row = rows[0]
          if (!row) {
            return yield* Effect.fail(new NotFoundError({ entity: "Project", id: projectId }))
          }

          const details: AdminProjectDetails = {
            id: row.id,
            name: row.name,
            slug: row.slug,
            organization: {
              id: row.organizationId,
              name: row.organizationName,
              slug: row.organizationSlug,
            },
            settings: (row.settings as ProjectSettings | null) ?? null,
            firstTraceAt: row.firstTraceAt,
            lastEditedAt: row.lastEditedAt,
            deletedAt: row.deletedAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
          return details
        }),

      getCurrentIssueStateCounts: (projectId: ProjectId) =>
        Effect.gen(function* () {
          // EXISTS-based per-issue classification — one row per issue,
          // counted once. A LEFT JOIN to `evaluations` would fan out
          // issues with multiple evals and overcount tracked.
          //
          // Per the metrics design, `evaluations.archived_at` is
          // ignored — once an issue ever had any (non-soft-deleted)
          // evaluation it remains tracked until it resolves. Lines up
          // with `getIssueLifecycleEvents`, which filters the same
          // way.
          const hasEvaluation = sql`EXISTS (
            SELECT 1 FROM ${evaluations}
            WHERE ${evaluations.issueId} = ${issues.id}
              AND ${evaluations.deletedAt} IS NULL
          )`
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                resolved: sql<number>`COUNT(*) FILTER (
                  WHERE ${issues.resolvedAt} IS NOT NULL
                     OR ${issues.ignoredAt} IS NOT NULL
                )::int`,
                tracked: sql<number>`COUNT(*) FILTER (
                  WHERE ${issues.resolvedAt} IS NULL
                    AND ${issues.ignoredAt} IS NULL
                    AND ${hasEvaluation}
                )::int`,
                untracked: sql<number>`COUNT(*) FILTER (
                  WHERE ${issues.resolvedAt} IS NULL
                    AND ${issues.ignoredAt} IS NULL
                    AND NOT ${hasEvaluation}
                )::int`,
              })
              .from(issues)
              .where(eq(issues.projectId, projectId)),
          )

          const row = rows[0]
          const snapshot: ProjectIssueStateSnapshot = {
            untracked: Number(row?.untracked ?? 0),
            tracked: Number(row?.tracked ?? 0),
            resolved: Number(row?.resolved ?? 0),
          }
          return snapshot
        }),

      getIssueLifecycleEvents: (projectId: ProjectId, since: Date) =>
        Effect.gen(function* () {
          // Pull issues whose own lifecycle timestamps fall in the
          // window, OR which have any (non-soft-deleted) evaluation
          // created in the window. `evaluations.archived_at` is
          // ignored per design — once an issue had any eval it's
          // tracked. `evaluations.deleted_at IS NULL` is enforced so
          // soft-deleted evals don't count as ever having attached
          // (matches `getCurrentIssueStateCounts`).
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                issueId: issues.id,
                createdAt: issues.createdAt,
                resolvedAt: issues.resolvedAt,
                ignoredAt: issues.ignoredAt,
                firstEvalAttachedAt: sql<Date | null>`(
                  SELECT MIN(${evaluations.createdAt})
                  FROM ${evaluations}
                  WHERE ${evaluations.issueId} = ${issues.id}
                    AND ${evaluations.deletedAt} IS NULL
                )`,
              })
              .from(issues)
              .where(
                and(
                  eq(issues.projectId, projectId),
                  or(
                    gte(issues.createdAt, since),
                    and(isNotNull(issues.resolvedAt), gte(issues.resolvedAt, since)),
                    and(isNotNull(issues.ignoredAt), gte(issues.ignoredAt, since)),
                    sql`EXISTS (
                      SELECT 1 FROM ${evaluations}
                      WHERE ${evaluations.issueId} = ${issues.id}
                        AND ${evaluations.deletedAt} IS NULL
                        AND ${evaluations.createdAt} >= ${since}
                    )`,
                  ),
                ),
              ),
          )

          return rows.map(
            (row): ProjectIssueLifecycleEvent => ({
              issueId: IssueId(row.issueId),
              createdAt: row.createdAt,
              firstEvalAttachedAt: row.firstEvalAttachedAt ? new Date(row.firstEvalAttachedAt) : null,
              resolvedAt: row.resolvedAt,
              ignoredAt: row.ignoredAt,
            }),
          )
        }),

      findIssueDetailsByIds: (ids) =>
        Effect.gen(function* () {
          if (ids.length === 0) return new Map<IssueId, ProjectIssueDetails>()
          const idList = ids as readonly string[]
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: issues.id,
                name: issues.name,
                resolvedAt: issues.resolvedAt,
                ignoredAt: issues.ignoredAt,
                hasEval: exists(
                  db
                    .select({ one: sql`1` })
                    .from(evaluations)
                    .where(and(eq(evaluations.issueId, issues.id), isNull(evaluations.deletedAt))),
                ),
              })
              .from(issues)
              .where(inArray(issues.id, idList)),
          )
          const out = new Map<IssueId, ProjectIssueDetails>()
          for (const row of rows) {
            const state: ProjectIssueDetails["state"] =
              row.resolvedAt !== null || row.ignoredAt !== null ? "resolved" : row.hasEval ? "tracked" : "untracked"
            out.set(IssueId(row.id), { name: row.name, state })
          }
          return out
        }),
    }
  }),
)
