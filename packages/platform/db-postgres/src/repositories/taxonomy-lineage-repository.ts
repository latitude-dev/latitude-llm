import { SqlClient, type SqlClientShape } from "@domain/shared"
import {
  type TaxonomyClusterLineage,
  TaxonomyDimension,
  TaxonomyLineageRepository,
  taxonomyClusterLineageSchema,
} from "@domain/taxonomy"
import { and, desc, eq, inArray } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { taxonomyClusterLineage } from "../schema/taxonomy-cluster-lineage.ts"

const toDomainLineage = (row: typeof taxonomyClusterLineage.$inferSelect): TaxonomyClusterLineage =>
  taxonomyClusterLineageSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    dimension: TaxonomyDimension.Topic,
    runId: row.runId,
    transitionType: row.transitionType,
    fromClusterIds: row.fromClusterIds,
    toClusterIds: row.toClusterIds,
    similarity: row.similarity,
    createdAt: row.createdAt,
  })

const toInsertRow = (lineage: TaxonomyClusterLineage): typeof taxonomyClusterLineage.$inferInsert => ({
  id: lineage.id,
  organizationId: lineage.organizationId,
  projectId: lineage.projectId,
  runId: lineage.runId,
  transitionType: lineage.transitionType,
  fromClusterIds: [...lineage.fromClusterIds],
  toClusterIds: [...lineage.toClusterIds],
  similarity: lineage.similarity,
  createdAt: lineage.createdAt,
})

export const TaxonomyLineageRepositoryLive = Layer.effect(
  TaxonomyLineageRepository,
  Effect.gen(function* () {
    return {
      appendMany: (rows) =>
        Effect.gen(function* () {
          if (rows.length === 0) return
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const insertRows = rows.map(toInsertRow)
          yield* sqlClient.query((db, organizationId) =>
            db.insert(taxonomyClusterLineage).values(insertRows.map((row) => ({ ...row, organizationId }))),
          )
        }),

      listRecent: ({ projectId, limit }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyClusterLineage)
              .where(
                and(
                  eq(taxonomyClusterLineage.organizationId, organizationId),
                  eq(taxonomyClusterLineage.projectId, projectId),
                ),
              )
              .orderBy(desc(taxonomyClusterLineage.createdAt))
              .limit(limit),
          )
          return rows.map(toDomainLineage)
        }),

      listRecentByTransitionTypes: ({ projectId, transitionTypes, limit }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyClusterLineage)
              .where(
                and(
                  eq(taxonomyClusterLineage.organizationId, organizationId),
                  eq(taxonomyClusterLineage.projectId, projectId),
                  inArray(taxonomyClusterLineage.transitionType, transitionTypes),
                ),
              )
              .orderBy(desc(taxonomyClusterLineage.createdAt))
              .limit(limit),
          )
          return rows.map(toDomainLineage)
        }),
    }
  }),
)
