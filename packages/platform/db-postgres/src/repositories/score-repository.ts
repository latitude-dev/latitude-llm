import type { Score, ScoreListOptions, ScoreSource } from "@domain/scores"
import { ScoreRepository, scoreSchema } from "@domain/scores"
import { type ProjectId, type ScoreId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { scores } from "../schema/scores.ts"

const toDomainScore = (row: typeof scores.$inferSelect): Score =>
  scoreSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    sessionId: row.sessionId,
    traceId: row.traceId,
    spanId: row.spanId,
    source: row.source,
    sourceId: row.sourceId,
    simulationId: row.simulationId,
    issueId: row.issueId,
    value: row.value,
    passed: row.passed,
    feedback: row.feedback,
    metadata: row.metadata,
    error: row.error,
    errored: row.errored,
    duration: row.duration,
    tokens: row.tokens,
    cost: row.cost,
    draftedAt: row.draftedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (score: Score): typeof scores.$inferInsert => ({
  id: score.id,
  organizationId: score.organizationId,
  projectId: score.projectId,
  sessionId: score.sessionId,
  traceId: score.traceId,
  spanId: score.spanId,
  source: score.source,
  sourceId: score.sourceId,
  simulationId: score.simulationId,
  issueId: score.issueId,
  value: score.value,
  passed: score.passed,
  feedback: score.feedback,
  metadata: score.metadata,
  error: score.error,
  errored: score.errored,
  duration: score.duration,
  tokens: score.tokens,
  cost: score.cost,
  draftedAt: score.draftedAt,
  createdAt: score.createdAt,
  updatedAt: score.updatedAt,
})

const applyDraftMode = (options: ScoreListOptions | undefined) => {
  if (options?.draftMode === "include") {
    return undefined
  }

  if (options?.draftMode === "only") {
    return isNotNull(scores.draftedAt)
  }

  return isNull(scores.draftedAt)
}

export const ScoreRepositoryLive = Layer.effect(
  ScoreRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    const list = (input: { readonly baseWhere: SQL<unknown>; readonly options: ScoreListOptions | undefined }) => {
      const limit = input.options?.limit ?? 50
      const offset = input.options?.offset ?? 0
      const draftClause = applyDraftMode(input.options)
      const whereClause = draftClause ? and(input.baseWhere, draftClause) : input.baseWhere

      return sqlClient
        .query((db) =>
          db
            .select()
            .from(scores)
            .where(whereClause)
            .orderBy(desc(scores.createdAt), desc(scores.id))
            .limit(limit + 1)
            .offset(offset),
        )
        .pipe(
          Effect.map((rows) => {
            const hasMore = rows.length > limit
            const items = rows.slice(0, limit).map(toDomainScore)

            return {
              items,
              hasMore,
              limit,
              offset,
            }
          }),
        )
    }

    return {
      findById: (id: ScoreId) =>
        sqlClient
          .query((db) => db.select().from(scores).where(eq(scores.id, id)).limit(1))
          .pipe(Effect.map((rows) => (rows[0] ? toDomainScore(rows[0]) : null))),

      save: (score: Score) =>
        Effect.gen(function* () {
          const row = toInsertRow(score)

          yield* sqlClient.query((db) =>
            db
              .insert(scores)
              .values(row)
              .onConflictDoUpdate({
                target: scores.id,
                set: {
                  sessionId: row.sessionId,
                  traceId: row.traceId,
                  spanId: row.spanId,
                  simulationId: row.simulationId,
                  issueId: row.issueId,
                  value: row.value,
                  passed: row.passed,
                  feedback: row.feedback,
                  metadata: row.metadata,
                  error: row.error,
                  errored: row.errored,
                  duration: row.duration,
                  tokens: row.tokens,
                  cost: row.cost,
                  draftedAt: row.draftedAt,
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
        readonly options?: ScoreListOptions
      }) =>
        list({
          baseWhere: eq(scores.projectId, projectId),
          options,
        }),

      listBySourceId: ({
        projectId,
        source,
        sourceId,
        options,
      }: {
        readonly projectId: ProjectId
        readonly source: ScoreSource
        readonly sourceId: string
        readonly options?: ScoreListOptions
      }) =>
        list({
          baseWhere:
            and(eq(scores.projectId, projectId), eq(scores.source, source), eq(scores.sourceId, sourceId)) ??
            eq(scores.projectId, projectId),
          options,
        }),
    }
  }),
)
