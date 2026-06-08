import { NotFoundError, SqlClient, type SqlClientShape } from "@domain/shared"
import { TaxonomyDimension, type TaxonomyRun, TaxonomyRunRepository, taxonomyRunSchema } from "@domain/taxonomy"
import { and, desc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { taxonomyRuns } from "../schema/taxonomy-runs.ts"

const toDomainRun = (row: typeof taxonomyRuns.$inferSelect): TaxonomyRun =>
  taxonomyRunSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    dimension: TaxonomyDimension.Topic,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    observationsScanned: row.observationsScanned,
    noiseScanned: row.noiseScanned,
    clustersBorn: row.clustersBorn,
    clustersMerged: row.clustersMerged,
    clustersDeprecated: row.clustersDeprecated,
    error: row.error,
  })

const toInsertRow = (run: TaxonomyRun): typeof taxonomyRuns.$inferInsert => ({
  id: run.id,
  organizationId: run.organizationId,
  projectId: run.projectId,
  trigger: run.trigger,
  status: run.status,
  startedAt: run.startedAt,
  completedAt: run.completedAt,
  observationsScanned: run.observationsScanned,
  noiseScanned: run.noiseScanned,
  clustersBorn: run.clustersBorn,
  clustersMerged: run.clustersMerged,
  clustersDeprecated: run.clustersDeprecated,
  error: run.error,
})

export const TaxonomyRunRepositoryLive = Layer.effect(
  TaxonomyRunRepository,
  Effect.gen(function* () {
    return {
      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(taxonomyRuns)
                .where(and(eq(taxonomyRuns.organizationId, organizationId), eq(taxonomyRuns.id, id)))
                .limit(1),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "TaxonomyRun", id }))
                return Effect.succeed(toDomainRun(row))
              }),
            )
        }),

      findLatestByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyRuns)
              .where(and(eq(taxonomyRuns.organizationId, organizationId), eq(taxonomyRuns.projectId, projectId)))
              .orderBy(desc(taxonomyRuns.startedAt))
              .limit(1),
          )
          return rows[0] ? toDomainRun(rows[0]) : null
        }),

      listRunning: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyRuns)
              .where(
                and(
                  eq(taxonomyRuns.organizationId, organizationId),
                  eq(taxonomyRuns.projectId, projectId),
                  eq(taxonomyRuns.status, "running"),
                ),
              )
              .orderBy(desc(taxonomyRuns.startedAt)),
          )
          return rows.map(toDomainRun)
        }),

      listRecentCompleted: ({ projectId, limit }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyRuns)
              .where(
                and(
                  eq(taxonomyRuns.organizationId, organizationId),
                  eq(taxonomyRuns.projectId, projectId),
                  eq(taxonomyRuns.status, "completed"),
                ),
              )
              .orderBy(desc(taxonomyRuns.startedAt))
              .limit(limit),
          )
          return rows.map(toDomainRun)
        }),

      insert: (run) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const row = toInsertRow(run)
          yield* sqlClient.query((db, organizationId) => db.insert(taxonomyRuns).values({ ...row, organizationId }))
        }),

      save: (run) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const row = toInsertRow(run)
          yield* sqlClient.query((db, organizationId) =>
            db
              .insert(taxonomyRuns)
              .values({ ...row, organizationId })
              .onConflictDoUpdate({
                target: taxonomyRuns.id,
                set: {
                  projectId: row.projectId,
                  trigger: row.trigger,
                  status: row.status,
                  startedAt: row.startedAt,
                  completedAt: row.completedAt,
                  observationsScanned: row.observationsScanned,
                  noiseScanned: row.noiseScanned,
                  clustersBorn: row.clustersBorn,
                  clustersMerged: row.clustersMerged,
                  clustersDeprecated: row.clustersDeprecated,
                  error: row.error,
                },
              }),
          )
        }),
    }
  }),
)
