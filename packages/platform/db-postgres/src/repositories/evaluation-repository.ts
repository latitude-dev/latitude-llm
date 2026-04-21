import type { Evaluation, EvaluationAlignment, EvaluationListOptions, EvaluationTrigger } from "@domain/evaluations"
import { EvaluationRepository, evaluationSchema } from "@domain/evaluations"
import {
  type EvaluationId,
  type IssueId,
  NotFoundError,
  type ProjectId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, desc, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { evaluations } from "../schema/evaluations.ts"

const toDomainEvaluation = (row: typeof evaluations.$inferSelect): Evaluation =>
  evaluationSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    issueId: row.issueId,
    name: row.name,
    description: row.description,
    script: row.script,
    trigger: row.trigger as EvaluationTrigger,
    alignment: row.alignment as EvaluationAlignment,
    alignedAt: row.alignedAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (evaluation: Evaluation): typeof evaluations.$inferInsert => ({
  id: evaluation.id,
  organizationId: evaluation.organizationId,
  projectId: evaluation.projectId,
  issueId: evaluation.issueId,
  name: evaluation.name,
  description: evaluation.description,
  script: evaluation.script,
  trigger: evaluation.trigger,
  alignment: evaluation.alignment,
  alignedAt: evaluation.alignedAt,
  archivedAt: evaluation.archivedAt,
  deletedAt: evaluation.deletedAt,
  createdAt: evaluation.createdAt,
  updatedAt: evaluation.updatedAt,
})

const applyLifecycleFilter = (options: EvaluationListOptions | undefined): SQL<unknown> => {
  switch (options?.lifecycle) {
    case "archived":
      return and(isNull(evaluations.deletedAt), isNotNull(evaluations.archivedAt)) ?? isNull(evaluations.deletedAt)
    case "all":
      return isNull(evaluations.deletedAt)
    default:
      return and(isNull(evaluations.deletedAt), isNull(evaluations.archivedAt)) ?? isNull(evaluations.deletedAt)
  }
}

export const EvaluationRepositoryLive = Layer.effect(
  EvaluationRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    const list = (input: { readonly baseWhere: SQL<unknown>; readonly options: EvaluationListOptions | undefined }) =>
      sqlClient
        .query((db, organizationId) => {
          const limit = input.options?.limit ?? 50
          const offset = input.options?.offset ?? 0
          const lifecycleWhere = applyLifecycleFilter(input.options)
          const whereClause =
            and(eq(evaluations.organizationId, organizationId), input.baseWhere, lifecycleWhere) ??
            and(eq(evaluations.organizationId, organizationId), input.baseWhere)

          return db
            .select()
            .from(evaluations)
            .where(whereClause)
            .orderBy(desc(evaluations.createdAt), desc(evaluations.id))
            .limit(limit + 1)
            .offset(offset)
        })
        .pipe(
          Effect.map((rows) => {
            const limit = input.options?.limit ?? 50
            const hasMore = rows.length > limit
            const items = rows.slice(0, limit).map(toDomainEvaluation)

            return {
              items,
              hasMore,
              limit,
              offset: input.options?.offset ?? 0,
            }
          }),
        )

    return {
      findById: (id: string) =>
        sqlClient
          .query((db, organizationId) =>
            db
              .select()
              .from(evaluations)
              .where(and(eq(evaluations.organizationId, organizationId), eq(evaluations.id, id)))
              .limit(1),
          )
          .pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (!row) {
                return Effect.fail(new NotFoundError({ entity: "Evaluation", id }))
              }

              return Effect.succeed(toDomainEvaluation(row))
            }),
          ),

      save: (evaluation: Evaluation) =>
        Effect.gen(function* () {
          const row = toInsertRow(evaluation)

          yield* sqlClient.query((db) =>
            db
              .insert(evaluations)
              .values(row)
              .onConflictDoUpdate({
                target: evaluations.id,
                set: {
                  issueId: row.issueId,
                  name: row.name,
                  description: row.description,
                  script: row.script,
                  trigger: row.trigger,
                  alignment: row.alignment,
                  alignedAt: row.alignedAt,
                  archivedAt: row.archivedAt,
                  deletedAt: row.deletedAt,
                  updatedAt: row.updatedAt,
                },
              }),
          )
        }),

      listByProjectId: ({
        projectId,
        options,
      }: {
        readonly projectId: ProjectId
        readonly options?: EvaluationListOptions
      }) =>
        list({
          baseWhere: eq(evaluations.projectId, projectId),
          options,
        }),

      listByIssueId: ({
        projectId,
        issueId,
        options,
      }: {
        readonly projectId: ProjectId
        readonly issueId: IssueId
        readonly options?: EvaluationListOptions
      }) =>
        list({
          baseWhere:
            and(eq(evaluations.projectId, projectId), eq(evaluations.issueId, issueId)) ??
            eq(evaluations.projectId, projectId),
          options,
        }),

      listByIssueIds: ({
        projectId,
        issueIds,
        options,
      }: {
        readonly projectId: ProjectId
        readonly issueIds: readonly IssueId[]
        readonly options?: EvaluationListOptions
      }) => {
        if (issueIds.length === 0) {
          return Effect.succeed({
            items: [],
            hasMore: false,
            limit: options?.limit ?? 50,
            offset: options?.offset ?? 0,
          })
        }

        return list({
          baseWhere:
            and(eq(evaluations.projectId, projectId), inArray(evaluations.issueId, issueIds as unknown as string[])) ??
            eq(evaluations.projectId, projectId),
          options,
        })
      },

      archive: (id: EvaluationId) =>
        sqlClient
          .query((db, organizationId) =>
            db
              .update(evaluations)
              .set({ archivedAt: new Date(), updatedAt: new Date() })
              .where(
                and(
                  eq(evaluations.organizationId, organizationId),
                  eq(evaluations.id, id),
                  isNull(evaluations.deletedAt),
                ),
              ),
          )
          .pipe(Effect.asVoid),

      unarchive: (id: EvaluationId) =>
        sqlClient
          .query((db, organizationId) =>
            db
              .update(evaluations)
              .set({ archivedAt: null, updatedAt: new Date() })
              .where(
                and(
                  eq(evaluations.organizationId, organizationId),
                  eq(evaluations.id, id),
                  isNull(evaluations.deletedAt),
                ),
              ),
          )
          .pipe(Effect.asVoid),

      softDelete: (id: EvaluationId) =>
        sqlClient
          .query((db, organizationId) =>
            db
              .update(evaluations)
              .set({ deletedAt: new Date(), updatedAt: new Date() })
              .where(
                and(
                  eq(evaluations.organizationId, organizationId),
                  eq(evaluations.id, id),
                  isNull(evaluations.deletedAt),
                ),
              ),
          )
          .pipe(Effect.asVoid),

      softDeleteByIssueId: ({ projectId, issueId }: { readonly projectId: ProjectId; readonly issueId: IssueId }) =>
        sqlClient
          .query((db, organizationId) =>
            db
              .update(evaluations)
              .set({ deletedAt: new Date(), updatedAt: new Date() })
              .where(
                and(
                  eq(evaluations.organizationId, organizationId),
                  eq(evaluations.projectId, projectId),
                  eq(evaluations.issueId, issueId),
                  isNull(evaluations.deletedAt),
                ),
              ),
          )
          .pipe(Effect.asVoid),
    }
  }),
)
