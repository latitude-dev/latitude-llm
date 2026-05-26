import { NotFoundError, RepositoryError, SqlClient, type SqlClientShape, TaxonomyClusterId } from "@domain/shared"
import {
  normalizeTaxonomyCentroid,
  TAXONOMY_EMBEDDING_DIMENSIONS,
  TAXONOMY_EMBEDDING_MODEL,
  TAXONOMY_SEARCH_MIN_SCORE,
  TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY,
  type TaxonomyCluster,
  TaxonomyClusterRepository,
  taxonomyClusterSchema,
} from "@domain/taxonomy"
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNotNull, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { taxonomyClusters } from "../schema/taxonomy-clusters.ts"

const toDomainCluster = (row: typeof taxonomyClusters.$inferSelect): TaxonomyCluster =>
  taxonomyClusterSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    parentCategoryId: row.parentCategoryId,
    name: row.name,
    description: row.description,
    centroid: row.centroid,
    observationCount: row.observationCount,
    state: row.state,
    mergedIntoClusterId: row.mergedIntoClusterId,
    firstObservedAt: row.firstObservedAt,
    lastObservedAt: row.lastObservedAt,
    clusteredAt: row.clusteredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const validateVector = (
  vector: readonly number[],
  operation: string,
): Effect.Effect<readonly number[], RepositoryError> => {
  if (vector.length !== TAXONOMY_EMBEDDING_DIMENSIONS) {
    return Effect.fail(
      new RepositoryError({
        operation,
        cause: new Error(`Expected ${TAXONOMY_EMBEDDING_DIMENSIONS} dimensions, received ${vector.length}`),
      }),
    )
  }

  const nonFiniteIndex = vector.findIndex((value) => !Number.isFinite(value))
  if (nonFiniteIndex !== -1) {
    return Effect.fail(
      new RepositoryError({
        operation,
        cause: new Error(`Vector contains non-finite value at index ${nonFiniteIndex}`),
      }),
    )
  }

  return Effect.succeed(vector)
}

const toVectorLiteral = (vector: readonly number[], operation: string) =>
  validateVector(vector, operation).pipe(Effect.map((validated) => sql.raw(`'[${validated.join(",")}]'::vector`)))

const toCentroidEmbedding = (cluster: TaxonomyCluster): Effect.Effect<readonly number[] | null, RepositoryError> => {
  if (cluster.centroid.mass <= 0) return Effect.succeed(null)

  if (cluster.centroid.model !== TAXONOMY_EMBEDDING_MODEL) {
    return Effect.fail(
      new RepositoryError({
        operation: "TaxonomyClusterRepository.save",
        cause: new Error(`Unsupported centroid model ${cluster.centroid.model}`),
      }),
    )
  }

  const vector = normalizeTaxonomyCentroid(cluster.centroid)
  if (vector.length === 0) {
    return Effect.fail(
      new RepositoryError({
        operation: "TaxonomyClusterRepository.save",
        cause: new Error("Positive-mass centroid normalized to an empty vector"),
      }),
    )
  }

  return validateVector(vector, "TaxonomyClusterRepository.save")
}

const toInsertRow = (
  cluster: TaxonomyCluster,
  centroidEmbedding: readonly number[] | null,
): typeof taxonomyClusters.$inferInsert => ({
  id: cluster.id,
  organizationId: cluster.organizationId,
  projectId: cluster.projectId,
  parentCategoryId: cluster.parentCategoryId,
  name: cluster.name,
  description: cluster.description,
  centroid: cluster.centroid,
  centroidEmbedding: centroidEmbedding === null ? null : [...centroidEmbedding],
  observationCount: cluster.observationCount,
  state: cluster.state,
  mergedIntoClusterId: cluster.mergedIntoClusterId,
  firstObservedAt: cluster.firstObservedAt,
  lastObservedAt: cluster.lastObservedAt,
  clusteredAt: cluster.clusteredAt,
  createdAt: cluster.createdAt,
  updatedAt: cluster.updatedAt,
})

export const TaxonomyClusterRepositoryLive = Layer.effect(
  TaxonomyClusterRepository,
  Effect.gen(function* () {
    return {
      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(taxonomyClusters)
                .where(and(eq(taxonomyClusters.organizationId, organizationId), eq(taxonomyClusters.id, id)))
                .limit(1),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "TaxonomyCluster", id }))
                return Effect.succeed(toDomainCluster(row))
              }),
            )
        }),

      listByIds: (ids) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          if (ids.length === 0) return []
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyClusters)
              .where(and(eq(taxonomyClusters.organizationId, organizationId), inArray(taxonomyClusters.id, ids))),
          )
          return rows.map(toDomainCluster)
        }),

      listActiveByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(taxonomyClusters)
              .where(
                and(
                  eq(taxonomyClusters.organizationId, organizationId),
                  eq(taxonomyClusters.projectId, projectId),
                  eq(taxonomyClusters.state, "active"),
                ),
              )
              .orderBy(desc(taxonomyClusters.observationCount), asc(taxonomyClusters.id)),
          )
          return rows.map(toDomainCluster)
        }),

      listNearestActive: ({ projectId, queryVector, k }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const vector = yield* toVectorLiteral(queryVector, "TaxonomyClusterRepository.listNearestActive")
          const cosine = sql<number>`(1::double precision - (${taxonomyClusters.centroidEmbedding} <=> ${vector}))`

          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ ...getTableColumns(taxonomyClusters), cosine })
              .from(taxonomyClusters)
              .where(
                and(
                  eq(taxonomyClusters.organizationId, organizationId),
                  eq(taxonomyClusters.projectId, projectId),
                  eq(taxonomyClusters.state, "active"),
                  isNotNull(taxonomyClusters.centroidEmbedding),
                ),
              )
              .orderBy(desc(cosine), asc(taxonomyClusters.id))
              .limit(k),
          )

          return rows.map((row) => ({ cluster: toDomainCluster(row), cosine: row.cosine }))
        }),

      hybridSearch: ({ projectId, query, normalizedEmbedding, state, parentCategoryId, limit, offset }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const vector = yield* toVectorLiteral(normalizedEmbedding, "TaxonomyClusterRepository.hybridSearch")
          const lexicalQuery = sql`websearch_to_tsquery('english', ${query})`
          const vectorScore = sql<number>`(1::double precision - (${taxonomyClusters.centroidEmbedding} <=> ${vector}))`
          const lexicalScore = sql<number>`least(
            1::double precision,
            greatest(0::double precision, ts_rank_cd(${taxonomyClusters.searchDocument}, ${lexicalQuery})::double precision)
          )`
          const score = sql<number>`(0.7::double precision * ${vectorScore} + 0.3::double precision * ${lexicalScore})`

          const conditions = [
            eq(taxonomyClusters.organizationId, sqlClient.organizationId),
            eq(taxonomyClusters.projectId, projectId),
            eq(taxonomyClusters.state, state ?? "active"),
            isNotNull(taxonomyClusters.centroidEmbedding),
            or(gte(score, TAXONOMY_SEARCH_MIN_SCORE), gte(vectorScore, TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY)),
          ]
          if (parentCategoryId) conditions.push(eq(taxonomyClusters.parentCategoryId, parentCategoryId))

          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                clusterId: taxonomyClusters.id,
                name: taxonomyClusters.name,
                description: taxonomyClusters.description,
                score,
              })
              .from(taxonomyClusters)
              .where(and(...conditions))
              .orderBy(desc(score), desc(vectorScore), desc(taxonomyClusters.updatedAt), asc(taxonomyClusters.id))
              .limit(limit)
              .offset(offset),
          )

          return rows.map((row) => ({ ...row, clusterId: TaxonomyClusterId(row.clusterId) }))
        }),

      list: ({ projectId, state, parentCategoryId, sort, limit, offset }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const conditions = [
            eq(taxonomyClusters.organizationId, sqlClient.organizationId),
            eq(taxonomyClusters.projectId, projectId),
          ]
          if (state) conditions.push(eq(taxonomyClusters.state, state))
          if (parentCategoryId !== undefined) conditions.push(eq(taxonomyClusters.parentCategoryId, parentCategoryId))

          const orderBy = (() => {
            switch (sort ?? "observation_count_desc") {
              case "last_observed_desc":
                return [desc(taxonomyClusters.lastObservedAt), asc(taxonomyClusters.id)] as const
              case "name_asc":
                return [asc(taxonomyClusters.name), asc(taxonomyClusters.id)] as const
              case "observation_count_desc":
                return [
                  desc(taxonomyClusters.observationCount),
                  desc(taxonomyClusters.lastObservedAt),
                  asc(taxonomyClusters.id),
                ] as const
            }
          })()

          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(taxonomyClusters)
              .where(and(...conditions))
              .orderBy(...orderBy)
              .limit(limit + 1)
              .offset(offset),
          )

          return {
            items: rows.slice(0, limit).map(toDomainCluster),
            hasMore: rows.length > limit,
            limit,
            offset,
          }
        }),

      save: (cluster) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const centroidEmbedding = yield* toCentroidEmbedding(cluster)
          const row = toInsertRow(cluster, centroidEmbedding)

          yield* sqlClient.query((db, organizationId) =>
            db
              .insert(taxonomyClusters)
              .values({ ...row, organizationId })
              .onConflictDoUpdate({
                target: taxonomyClusters.id,
                set: {
                  projectId: row.projectId,
                  parentCategoryId: row.parentCategoryId,
                  name: row.name,
                  description: row.description,
                  centroid: row.centroid,
                  centroidEmbedding: row.centroidEmbedding,
                  observationCount: row.observationCount,
                  state: row.state,
                  mergedIntoClusterId: row.mergedIntoClusterId,
                  firstObservedAt: row.firstObservedAt,
                  lastObservedAt: row.lastObservedAt,
                  clusteredAt: row.clusteredAt,
                  updatedAt: row.updatedAt,
                },
              }),
          )
        }),

      bulkUpdateParentCategory: ({ projectId, assignments }) =>
        Effect.gen(function* () {
          if (assignments.length === 0) return
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const updatedAt = new Date()
          const valuesSql = sql.join(
            assignments.map(
              (assignment) => sql`(${assignment.clusterId}::varchar, ${assignment.parentCategoryId ?? null}::varchar)`,
            ),
            sql.raw(", "),
          )
          yield* sqlClient.query((db, organizationId) =>
            db.execute(sql`
              UPDATE ${taxonomyClusters}
              SET parent_category_id = v.parent_category_id, updated_at = ${updatedAt}
              FROM (VALUES ${valuesSql}) AS v(cluster_id, parent_category_id)
              WHERE ${taxonomyClusters.organizationId} = ${organizationId}
                AND ${taxonomyClusters.projectId} = ${projectId}
                AND ${taxonomyClusters.id} = v.cluster_id
            `),
          )
        }),

      markMerged: ({ clusterId, mergedIntoClusterId, timestamp }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .update(taxonomyClusters)
              .set({ state: "merged", mergedIntoClusterId, updatedAt: timestamp })
              .where(and(eq(taxonomyClusters.organizationId, organizationId), eq(taxonomyClusters.id, clusterId))),
          )
        }),

      markDeprecated: ({ clusterId, timestamp }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .update(taxonomyClusters)
              .set({ state: "deprecated", updatedAt: timestamp })
              .where(and(eq(taxonomyClusters.organizationId, organizationId), eq(taxonomyClusters.id, clusterId))),
          )
        }),

      incrementObservationCount: ({ clusterId, delta, lastObservedAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .update(taxonomyClusters)
              .set({
                observationCount: sql`${taxonomyClusters.observationCount} + ${delta}`,
                lastObservedAt,
                updatedAt: lastObservedAt,
              })
              .where(and(eq(taxonomyClusters.organizationId, organizationId), eq(taxonomyClusters.id, clusterId))),
          )
        }),
    }
  }),
)
