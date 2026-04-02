import { type Issue, IssueRepository, issueSchema } from "@domain/issues"
import { type IssueId, type ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq, ilike } from "drizzle-orm"
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

const issueInsertFields = (o: Omit<Issue, "id">) => ({
  uuid: o.uuid,
  organizationId: o.organizationId,
  projectId: o.projectId,
  name: o.name,
  description: o.description,
  centroid: o.centroid,
  clusteredAt: o.clusteredAt,
  escalatedAt: o.escalatedAt,
  resolvedAt: o.resolvedAt,
  ignoredAt: o.ignoredAt,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
})

export const IssueRepositoryLive = Layer.effect(
  IssueRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      list: ({ projectId, limit, offset, nameFilter }) =>
        sqlClient
          .query((db) => {
            const baseWhere = eq(issues.projectId, projectId)
            const where =
              nameFilter && nameFilter.length > 0 ? and(baseWhere, ilike(issues.name, `%${nameFilter}%`)) : baseWhere

            return db
              .select()
              .from(issues)
              .where(where)
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
          .query((db) => db.select().from(issues).where(eq(issues.id, id)).limit(1))
          .pipe(Effect.map((rows) => (rows[0] ? toDomainIssue(rows[0]) : null))),

      findByUuid: ({ projectId, uuid }: { readonly projectId: ProjectId; readonly uuid: string }) =>
        sqlClient
          .query((db) =>
            db
              .select()
              .from(issues)
              .where(and(eq(issues.projectId, projectId), eq(issues.uuid, uuid)))
              .limit(1),
          )
          .pipe(Effect.map((rows) => (rows[0] ? toDomainIssue(rows[0]) : null))),

      create: ({ organizationId, projectId, uuid, name, description, centroid, clusteredAt }) => {
        const now = new Date()
        const row = issueInsertFields({
          uuid,
          organizationId,
          projectId,
          name,
          description,
          centroid,
          clusteredAt,
          escalatedAt: null,
          resolvedAt: null,
          ignoredAt: null,
          createdAt: now,
          updatedAt: now,
        })

        return sqlClient
          .query((db) => db.insert(issues).values(row).returning())
          .pipe(
            Effect.flatMap((rows) =>
              rows[0] ? Effect.succeed(toDomainIssue(rows[0])) : Effect.die(new Error("Issue insert returned no rows")),
            ),
          )
      },
      save: (issue: Issue) =>
        Effect.gen(function* () {
          const row = { id: issue.id, ...issueInsertFields(issue) }

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
