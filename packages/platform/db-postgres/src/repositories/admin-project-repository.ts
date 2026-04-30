import {
  type AdminProjectDetails,
  AdminProjectRepository,
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
import { and, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
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
          // One pass over `issues` + `LEFT JOIN evaluations` (filtered to
          // non-archived, non-deleted), bucketed by lifecycle. The CASE
          // expression on the `evaluations.id` join produces NULL for
          // issues with no live eval; counting it gives "tracked" once
          // we filter to active issues only.
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                untracked: sql<number>`COUNT(*) FILTER (
                  WHERE ${issues.resolvedAt} IS NULL
                    AND ${issues.ignoredAt} IS NULL
                    AND ${evaluations.id} IS NULL
                )::int`,
                tracked: sql<number>`COUNT(*) FILTER (
                  WHERE ${issues.resolvedAt} IS NULL
                    AND ${issues.ignoredAt} IS NULL
                    AND ${evaluations.id} IS NOT NULL
                )::int`,
                resolved: sql<number>`COUNT(DISTINCT CASE
                  WHEN ${issues.resolvedAt} IS NOT NULL OR ${issues.ignoredAt} IS NOT NULL
                  THEN ${issues.id}
                END)::int`,
              })
              .from(issues)
              // We need at least one row per issue → LEFT JOIN. To avoid
              // double-counting issues with multiple live evals, the
              // active filters above use `evaluations.id IS NULL/NOT NULL`
              // on a single matched row, but the resolved count above
              // uses COUNT(DISTINCT) over the issue id since LEFT JOIN
              // can fan it out.
              .leftJoin(
                evaluations,
                and(eq(evaluations.issueId, issues.id), isNull(evaluations.deletedAt), isNull(evaluations.archivedAt)),
              )
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
          // Pull issues whose own lifecycle timestamps fall in the window,
          // OR which have any evaluation created in the window. The
          // outer query joins back to MIN(eval.created_at) per issue for
          // "first eval attached at" — we treat the earliest evaluation
          // as the moment the issue became "tracked", regardless of
          // whether that eval was later archived (per design,
          // `evaluations.archived_at` is ignored for the lifecycle
          // composer).
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

      findIssueNamesByIds: (ids) =>
        Effect.gen(function* () {
          if (ids.length === 0) return new Map<IssueId, string>()
          const idList = ids as readonly string[]
          const rows = yield* sqlClient.query((db) =>
            db.select({ id: issues.id, name: issues.name }).from(issues).where(inArray(issues.id, idList)),
          )
          const out = new Map<IssueId, string>()
          for (const row of rows) {
            out.set(IssueId(row.id), row.name)
          }
          return out
        }),
    }
  }),
)
