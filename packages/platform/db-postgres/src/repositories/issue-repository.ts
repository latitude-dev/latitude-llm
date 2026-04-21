import { EvaluationIssueRepository } from "@domain/evaluations"
import { type Issue, IssueRepository, issueSchema, MIN_OCCURRENCES_FOR_VISIBILITY } from "@domain/issues"
import { type IssueId, NotFoundError, type ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq, inArray, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { issues } from "../schema/issues.ts"
import { scores } from "../schema/scores.ts"

const toDomainIssue = (row: typeof issues.$inferSelect): Issue =>
  issueSchema.parse({
    id: row.id,
    uuid: row.uuid,
    organizationId: row.organizationId,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    centroid: row.centroid,
    clusteredAt: row.clusteredAt,
    escalatedAt: row.escalatedAt,
    resolvedAt: row.resolvedAt,
    ignoredAt: row.ignoredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (issue: Issue): typeof issues.$inferInsert => ({
  id: issue.id,
  uuid: issue.uuid,
  organizationId: issue.organizationId,
  projectId: issue.projectId,
  name: issue.name,
  description: issue.description,
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
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      list: ({ projectId, limit, offset }) =>
        sqlClient
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
              .select()
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
              items: rows.slice(0, limit).map(toDomainIssue),
              hasMore: rows.length > limit,
              limit,
              offset,
            })),
          ),

      findById: (id: IssueId) =>
        sqlClient
          .query((db, organizationId) =>
            db
              .select()
              .from(issues)
              .where(and(eq(issues.organizationId, organizationId), eq(issues.id, id)))
              .limit(1),
          )
          .pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (!row) return Effect.fail(new NotFoundError({ entity: "Issue", id }))
              return Effect.succeed(toDomainIssue(row))
            }),
          ),

      findByIdForUpdate: (id: IssueId) =>
        sqlClient
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
          ),

      findByIds: ({ projectId, issueIds }: { readonly projectId: ProjectId; readonly issueIds: readonly IssueId[] }) =>
        sqlClient
          .query((db, organizationId) => {
            if (issueIds.length === 0) {
              return db.select().from(issues).where(sql`1 = 0`) // Return empty result
            }

            return db
              .select()
              .from(issues)
              .where(
                and(
                  eq(issues.organizationId, organizationId),
                  eq(issues.projectId, projectId),
                  inArray(issues.id, issueIds),
                ),
              )
          })
          .pipe(Effect.map((rows) => rows.map(toDomainIssue))),

      findByUuid: ({ projectId, uuid }: { readonly projectId: ProjectId; readonly uuid: string }) =>
        sqlClient
          .query((db, organizationId) =>
            db
              .select()
              .from(issues)
              .where(
                and(eq(issues.organizationId, organizationId), eq(issues.projectId, projectId), eq(issues.uuid, uuid)),
              )
              .limit(1),
          )
          .pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (!row) return Effect.fail(new NotFoundError({ entity: "Issue", id: uuid }))
              return Effect.succeed(toDomainIssue(row))
            }),
          ),

      save: (issue: Issue) =>
        Effect.gen(function* () {
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
                  name: row.name,
                  description: row.description,
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
