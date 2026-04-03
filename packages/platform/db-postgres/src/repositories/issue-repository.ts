import { type Issue, IssueRepository, issueSchema } from "@domain/issues"
import { type IssueId, NotFoundError, type ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { issues } from "../schema/issues.ts"

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

export const IssueRepositoryLive = Layer.effect(
  IssueRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      list: ({ projectId, limit, offset }) =>
        sqlClient
          .query((db) =>
            db
              .select()
              .from(issues)
              .where(eq(issues.projectId, projectId))
              .orderBy(desc(issues.createdAt))
              .limit(limit + 1)
              .offset(offset),
          )
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
          .query((db) => db.select().from(issues).where(eq(issues.id, id)).limit(1))
          .pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (!row) return Effect.fail(new NotFoundError({ entity: "Issue", id }))
              return Effect.succeed(toDomainIssue(row))
            }),
          ),

      findByIdForUpdate: (id: IssueId) =>
        sqlClient
          .query((db) => db.select().from(issues).where(eq(issues.id, id)).limit(1).for("update"))
          .pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (!row) return Effect.fail(new NotFoundError({ entity: "Issue", id }))
              return Effect.succeed(toDomainIssue(row))
            }),
          ),

      findByUuid: ({ projectId, uuid }: { readonly projectId: ProjectId; readonly uuid: string }) =>
        sqlClient
          .query((db) =>
            db
              .select()
              .from(issues)
              .where(and(eq(issues.projectId, projectId), eq(issues.uuid, uuid)))
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
