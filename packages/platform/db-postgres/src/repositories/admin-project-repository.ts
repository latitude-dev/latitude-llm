import {
  type AdminProjectDetails,
  AdminProjectRepository,
  type AdminProjectSummary,
  type ProjectSignalDetails,
  type ProjectSignalLifecycleEvent,
  type ProjectSignalStateSnapshot,
} from "@domain/admin"
import {
  NotFoundError,
  type OrganizationId,
  type ProjectId,
  type ProjectSettings,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, eq, exists, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { organizations } from "../schema/better-auth.ts"
import { evaluations } from "../schema/evaluations.ts"
import { projects } from "../schema/projects.ts"
import { signals } from "../schema/signals.ts"

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

      getCurrentSignalStateCounts: (projectId: ProjectId) =>
        Effect.gen(function* () {
          // EXISTS-based per-issue classification — one row per issue,
          // counted once. A LEFT JOIN to `evaluations` would fan out
          // signals with multiple evals and overcount tracked.
          //
          // Per the metrics design, `evaluations.archived_at` is
          // ignored — once an issue ever had any (non-soft-deleted)
          // evaluation it remains tracked until it resolves. Lines up
          // with `getSignalLifecycleEvents`, which filters the same
          // way.
          const hasEvaluation = sql`EXISTS (
            SELECT 1 FROM ${evaluations}
            WHERE ${evaluations.signalId} = ${signals.id}
              AND ${evaluations.deletedAt} IS NULL
          )`
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                resolved: sql<number>`COUNT(*) FILTER (
                  WHERE ${signals.resolvedAt} IS NOT NULL OR ${signals.ignoredAt} IS NOT NULL
                )::int`,
                tracked: sql<number>`COUNT(*) FILTER (
                  WHERE ${signals.resolvedAt} IS NULL AND ${signals.ignoredAt} IS NULL
                    AND ${hasEvaluation}
                )::int`,
                untracked: sql<number>`COUNT(*) FILTER (
                  WHERE ${signals.resolvedAt} IS NULL AND ${signals.ignoredAt} IS NULL
                    AND NOT ${hasEvaluation}
                )::int`,
              })
              .from(signals)
              .where(eq(signals.projectId, projectId)),
          )

          const row = rows[0]
          const snapshot: ProjectSignalStateSnapshot = {
            untracked: Number(row?.untracked ?? 0),
            tracked: Number(row?.tracked ?? 0),
            resolved: Number(row?.resolved ?? 0),
          }
          return snapshot
        }),

      getSignalLifecycleEvents: (projectId: ProjectId, since: Date) =>
        Effect.gen(function* () {
          // Pull signals whose own lifecycle timestamps fall in the
          // window, OR which have any (non-soft-deleted) evaluation
          // created in the window. `evaluations.archived_at` is
          // ignored per design — once an issue had any eval it's
          // tracked. `evaluations.deleted_at IS NULL` is enforced so
          // soft-deleted evals don't count as ever having attached
          // (matches `getCurrentSignalStateCounts`).
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                signalId: signals.id,
                createdAt: signals.createdAt,
                resolvedAt: signals.resolvedAt,
                ignoredAt: signals.ignoredAt,
                firstEvalAttachedAt: sql<Date | null>`(
                  SELECT MIN(${evaluations.createdAt})
                  FROM ${evaluations}
                  WHERE ${evaluations.signalId} = ${signals.id}
                    AND ${evaluations.deletedAt} IS NULL
                )`,
              })
              .from(signals)
              .where(
                and(
                  eq(signals.projectId, projectId),
                  or(
                    gte(signals.createdAt, since),
                    and(isNotNull(signals.resolvedAt), gte(signals.resolvedAt, since)),
                    and(isNotNull(signals.ignoredAt), gte(signals.ignoredAt, since)),
                    sql`EXISTS (
                      SELECT 1 FROM ${evaluations}
                      WHERE ${evaluations.signalId} = ${signals.id}
                        AND ${evaluations.deletedAt} IS NULL
                        AND ${evaluations.createdAt} >= ${since}
                    )`,
                  ),
                ),
              ),
          )

          return rows.map(
            (row): ProjectSignalLifecycleEvent => ({
              signalId: SignalId(row.signalId),
              createdAt: row.createdAt,
              firstEvalAttachedAt: row.firstEvalAttachedAt ? new Date(row.firstEvalAttachedAt) : null,
              resolvedAt: row.resolvedAt,
              ignoredAt: row.ignoredAt,
            }),
          )
        }),

      findSignalDetailsByIds: (ids) =>
        Effect.gen(function* () {
          if (ids.length === 0) return new Map<SignalId, ProjectSignalDetails>()
          const idList = ids as readonly string[]
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: signals.id,
                name: signals.name,
                resolvedAt: signals.resolvedAt,
                ignoredAt: signals.ignoredAt,
                hasEval: exists(
                  db
                    .select({ one: sql`1` })
                    .from(evaluations)
                    .where(and(eq(evaluations.signalId, signals.id), isNull(evaluations.deletedAt))),
                ),
              })
              .from(signals)
              .where(inArray(signals.id, idList)),
          )
          const out = new Map<SignalId, ProjectSignalDetails>()
          for (const row of rows) {
            const state: ProjectSignalDetails["state"] =
              row.resolvedAt !== null || row.ignoredAt !== null ? "resolved" : row.hasEval ? "tracked" : "untracked"
            out.set(SignalId(row.id), { name: row.name, state })
          }
          return out
        }),

      findManySummariesByIds: (ids) =>
        Effect.gen(function* () {
          if (ids.length === 0) return new Map<ProjectId, AdminProjectSummary>()
          const idList = ids as readonly string[]

          // No `deletedAt` filter, unlike `findById`: these ids come from ClickHouse usage that
          // already happened, and a project deleted since is exactly the one a reader needs named.
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: projects.id,
                name: projects.name,
                slug: projects.slug,
                organizationId: organizations.id,
                organizationName: organizations.name,
                organizationSlug: organizations.slug,
              })
              .from(projects)
              .innerJoin(organizations, eq(projects.organizationId, organizations.id))
              .where(inArray(projects.id, idList)),
          )

          const out = new Map<ProjectId, AdminProjectSummary>()
          for (const row of rows) {
            out.set(row.id as ProjectId, {
              id: row.id as ProjectId,
              name: row.name,
              slug: row.slug,
              organizationId: row.organizationId as OrganizationId,
              organizationName: row.organizationName,
              organizationSlug: row.organizationSlug,
            })
          }
          return out
        }),
    }
  }),
)
