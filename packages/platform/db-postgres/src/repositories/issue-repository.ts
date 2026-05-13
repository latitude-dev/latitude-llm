import { EvaluationIssueRepository } from "@domain/evaluations"
import {
  type Issue,
  type IssueLifecycleFlags,
  IssueRepository,
  type IssueWithLifecycle,
  issueSchema,
  MIN_OCCURRENCES_FOR_VISIBILITY,
} from "@domain/issues"
import { type IssueId, NotFoundError, type ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq, getTableColumns, inArray, ne, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { alertIncidents } from "../schema/alert-incidents.ts"
import { issues } from "../schema/issues.ts"
import { scores } from "../schema/scores.ts"

// Lifecycle flags derived from `alert_incidents` are joined onto every
// non-locking issue read. The two EXISTS subqueries are the system of record
// for "is this issue currently escalating / regressed" — see
// `deriveIssueLifecycleStates` in @domain/issues.
//
// `issues.id` is qualified via raw SQL because Drizzle's template renders
// the bare column inside the EXISTS subquery as `"id"` (unqualified), which
// collides with `alert_incidents.id` (the inner scope's PK) and silently
// resolves to the wrong column. The fully qualified outer reference avoids
// the shadowing.
const outerIssueId = sql.raw(`"latitude"."issues"."id"`)

const isEscalatingExpr = sql<boolean>`exists (
  select 1
  from ${alertIncidents}
  where ${alertIncidents.sourceType} = 'issue'
    and ${alertIncidents.sourceId} = ${outerIssueId}
    and ${alertIncidents.kind} = 'issue.escalating'
    and ${alertIncidents.endedAt} is null
)`

const isRegressedExpr = sql<boolean>`exists (
  select 1
  from ${alertIncidents}
  where ${alertIncidents.sourceType} = 'issue'
    and ${alertIncidents.sourceId} = ${outerIssueId}
    and ${alertIncidents.kind} = 'issue.regressed'
)`

const issueColumnsWithLifecycle = {
  ...getTableColumns(issues),
  isEscalating: isEscalatingExpr,
  isRegressed: isRegressedExpr,
} as const

type IssueRowWithLifecycle = typeof issues.$inferSelect & {
  readonly isEscalating: boolean
  readonly isRegressed: boolean
}

const toDomainIssue = (row: typeof issues.$inferSelect): Issue =>
  issueSchema.parse({
    id: row.id,
    uuid: row.uuid,
    organizationId: row.organizationId,
    projectId: row.projectId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    source: row.source,
    centroid: row.centroid,
    clusteredAt: row.clusteredAt,
    escalatedAt: row.escalatedAt,
    resolvedAt: row.resolvedAt,
    ignoredAt: row.ignoredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toIssueWithLifecycle = (row: IssueRowWithLifecycle): IssueWithLifecycle => {
  const issue = toDomainIssue(row)
  const lifecycle: IssueLifecycleFlags = {
    isEscalating: row.isEscalating,
    isRegressed: row.isRegressed,
  }
  return Object.assign({}, issue, { lifecycle })
}

const toInsertRow = (issue: Issue): typeof issues.$inferInsert => ({
  id: issue.id,
  uuid: issue.uuid,
  organizationId: issue.organizationId,
  projectId: issue.projectId,
  slug: issue.slug,
  name: issue.name,
  description: issue.description,
  source: issue.source,
  centroid: issue.centroid,
  clusteredAt: issue.clusteredAt,
  escalatedAt: issue.escalatedAt,
  resolvedAt: issue.resolvedAt,
  ignoredAt: issue.ignoredAt,
  createdAt: issue.createdAt,
  updatedAt: issue.updatedAt,
})

const issueRepositoryCoreLive = Layer.effect(
  IssueRepository,
  Effect.gen(function* () {
    return {
      list: ({ projectId, limit, offset }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) => {
              const hasAnnotationEvidence = sql<boolean>`exists (
                select 1
                from ${scores}
                where ${scores.issueId} = ${issues.id}
                  and ${scores.draftedAt} is null
                  and ${scores.source} = 'annotation'
              )`

              const meetsVisibilityThreshold = sql<boolean>`(
                select count(*)
                from ${scores}
                where ${scores.issueId} = ${issues.id}
                  and ${scores.draftedAt} is null
              ) >= ${MIN_OCCURRENCES_FOR_VISIBILITY}`

              return db
                .select(issueColumnsWithLifecycle)
                .from(issues)
                .where(
                  and(
                    eq(issues.organizationId, organizationId),
                    eq(issues.projectId, projectId),
                    or(hasAnnotationEvidence, meetsVisibilityThreshold),
                  ),
                )
                .orderBy(desc(issues.createdAt))
                .limit(limit + 1)
                .offset(offset)
            })
            .pipe(
              Effect.map((rows) => ({
                items: rows.slice(0, limit).map(toIssueWithLifecycle),
                hasMore: rows.length > limit,
                limit,
                offset,
              })),
            )
        }),

      findById: (id: IssueId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select(issueColumnsWithLifecycle)
                .from(issues)
                .where(and(eq(issues.organizationId, organizationId), eq(issues.id, id)))
                .limit(1),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "Issue", id }))
                return Effect.succeed(toIssueWithLifecycle(row))
              }),
            )
        }),

      findByIdForUpdate: (id: IssueId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(issues)
                .where(and(eq(issues.organizationId, organizationId), eq(issues.id, id)))
                .limit(1)
                .for("update"),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "Issue", id }))
                return Effect.succeed(toDomainIssue(row))
              }),
            )
        }),

      findByIds: ({ projectId, issueIds }: { readonly projectId: ProjectId; readonly issueIds: readonly IssueId[] }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) => {
              if (issueIds.length === 0) {
                return db.select(issueColumnsWithLifecycle).from(issues).where(sql`1 = 0`) // Return empty result
              }

              return db
                .select(issueColumnsWithLifecycle)
                .from(issues)
                .where(
                  and(
                    eq(issues.organizationId, organizationId),
                    eq(issues.projectId, projectId),
                    inArray(issues.id, issueIds),
                  ),
                )
            })
            .pipe(Effect.map((rows) => rows.map(toIssueWithLifecycle)))
        }),

      findByUuid: ({ projectId, uuid }: { readonly projectId: ProjectId; readonly uuid: string }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select(issueColumnsWithLifecycle)
                .from(issues)
                .where(
                  and(
                    eq(issues.organizationId, organizationId),
                    eq(issues.projectId, projectId),
                    eq(issues.uuid, uuid),
                  ),
                )
                .limit(1),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "Issue", id: uuid }))
                return Effect.succeed(toIssueWithLifecycle(row))
              }),
            )
        }),

      save: (issue: Issue) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const row = toInsertRow(issue)

          yield* sqlClient.query((db) =>
            db
              .insert(issues)
              .values(row)
              .onConflictDoUpdate({
                target: issues.id,
                set: {
                  uuid: row.uuid,
                  projectId: row.projectId,
                  slug: row.slug,
                  name: row.name,
                  description: row.description,
                  source: row.source,
                  centroid: row.centroid,
                  clusteredAt: row.clusteredAt,
                  escalatedAt: row.escalatedAt,
                  resolvedAt: row.resolvedAt,
                  ignoredAt: row.ignoredAt,
                  updatedAt: row.updatedAt,
                },
              }),
          )
        }),

      countBySlug: (input) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const conditions = and(
            eq(issues.organizationId, sqlClient.organizationId),
            eq(issues.projectId, input.projectId),
            eq(issues.slug, input.slug),
            ...(input.excludeIssueId ? [ne(issues.id, input.excludeIssueId)] : []),
          )
          const [row] = yield* sqlClient.query((db) =>
            db.select({ count: sql<number>`count(*)::int` }).from(issues).where(conditions),
          )
          return row?.count ?? 0
        }),
    }
  }),
)

const evaluationIssueRepositoryFromIssueRepositoryLive = Layer.effect(
  EvaluationIssueRepository,
  Effect.gen(function* () {
    return yield* IssueRepository
  }),
)

export const IssueRepositoryLive = Layer.mergeAll(
  issueRepositoryCoreLive,
  evaluationIssueRepositoryFromIssueRepositoryLive.pipe(Layer.provide(issueRepositoryCoreLive)),
)
