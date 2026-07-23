import { EMBEDDING_DIMENSIONS, resolveEmbeddingConfig } from "@domain/ai"
import {
  type CustomBehaviorId,
  type FacetId,
  NotFoundError,
  RepositoryError,
  SqlClient,
  type SqlClientShape,
  TaxonomyClusterId,
} from "@domain/shared"
import {
  normalizeTaxonomyCentroid,
  TAXONOMY_SEARCH_MIN_SCORE,
  TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY,
  type TaxonomyCluster,
  TaxonomyClusterRepository,
  TaxonomyDimension,
  taxonomyClusterSchema,
} from "@domain/taxonomy"
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNotNull, isNull, like, ne, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { taxonomyClusters } from "../schema/taxonomy-clusters.ts"

const toDomainCluster = (row: typeof taxonomyClusters.$inferSelect): TaxonomyCluster =>
  taxonomyClusterSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    customBehaviorId: row.customBehaviorId,
    facetId: row.facetId,
    dimension: TaxonomyDimension.Topic,
    parentClusterId: row.parentClusterId,
    depth: row.depth,
    path: row.path,
    splitLinkThreshold: row.splitLinkThreshold,
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
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    return Effect.fail(
      new RepositoryError({
        operation,
        cause: new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, received ${vector.length}`),
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

const toCentroidEmbedding = (cluster: TaxonomyCluster): Effect.Effect<readonly number[] | null, RepositoryError> =>
  Effect.gen(function* () {
    if (cluster.centroid.mass <= 0) return null

    // The embedding model is a one-time deployment choice (different models
    // produce incompatible vector spaces, and Latitude never re-embeds), so a
    // centroid stamped with anything but the configured model is a hard error.
    const embeddingConfig = yield* resolveEmbeddingConfig().pipe(
      Effect.mapError((error) => new RepositoryError({ operation: "TaxonomyClusterRepository.save", cause: error })),
    )
    if (cluster.centroid.model !== embeddingConfig.model) {
      return yield* Effect.fail(
        new RepositoryError({
          operation: "TaxonomyClusterRepository.save",
          cause: new Error(`Unsupported centroid model ${cluster.centroid.model}`),
        }),
      )
    }

    const vector = normalizeTaxonomyCentroid(cluster.centroid)
    if (vector.length === 0) {
      return yield* Effect.fail(
        new RepositoryError({
          operation: "TaxonomyClusterRepository.save",
          cause: new Error("Positive-mass centroid normalized to an empty vector"),
        }),
      )
    }

    return yield* validateVector(vector, "TaxonomyClusterRepository.save")
  })

const toInsertRow = (
  cluster: TaxonomyCluster,
  centroidEmbedding: readonly number[] | null,
): typeof taxonomyClusters.$inferInsert => ({
  id: cluster.id,
  organizationId: cluster.organizationId,
  projectId: cluster.projectId,
  customBehaviorId: cluster.customBehaviorId,
  facetId: cluster.facetId,
  parentClusterId: cluster.parentClusterId,
  depth: cluster.depth,
  path: cluster.path,
  splitLinkThreshold: cluster.splitLinkThreshold,
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

// Every view's tree shares one table; a view is (scope × lens). Reads MUST pin
// BOTH discriminators so the online whole-project topic tree (NULL, NULL) never
// leaks cohort or facet rows: omit/null a discriminator ⇒ IS NULL, an id ⇒
// equality. `(customBehaviorId=null, facetId=null)` is the online topic tree.
const scopeCondition = (scope: {
  readonly customBehaviorId: CustomBehaviorId | null | undefined
  readonly facetId: FacetId | null | undefined
}) =>
  and(
    scope.customBehaviorId == null
      ? isNull(taxonomyClusters.customBehaviorId)
      : eq(taxonomyClusters.customBehaviorId, scope.customBehaviorId),
    scope.facetId == null ? isNull(taxonomyClusters.facetId) : eq(taxonomyClusters.facetId, scope.facetId),
  )

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

      listActiveByProject: ({ projectId, parentClusterId, customBehaviorId, facetId }) =>
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
                  scopeCondition({ customBehaviorId, facetId }),
                  ...(parentClusterId === undefined
                    ? []
                    : parentClusterId === null
                      ? [isNull(taxonomyClusters.parentClusterId)]
                      : [eq(taxonomyClusters.parentClusterId, parentClusterId)]),
                ),
              )
              .orderBy(desc(taxonomyClusters.observationCount), asc(taxonomyClusters.id)),
          )
          return rows.map(toDomainCluster)
        }),

      listSubtreeIds: ({ projectId, clusterId, customBehaviorId, facetId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ id: taxonomyClusters.id })
              .from(taxonomyClusters)
              .where(
                and(
                  eq(taxonomyClusters.organizationId, organizationId),
                  eq(taxonomyClusters.projectId, projectId),
                  eq(taxonomyClusters.state, "active"),
                  scopeCondition({ customBehaviorId, facetId }),
                  or(eq(taxonomyClusters.id, clusterId), like(taxonomyClusters.path, `%${clusterId}/%`)),
                ),
              ),
          )
          return rows.map((row) => TaxonomyClusterId(row.id))
        }),

      listNearestActive: ({ projectId, queryVector, k, parentClusterId }) =>
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
                  isNull(taxonomyClusters.customBehaviorId),
                  isNull(taxonomyClusters.facetId),
                  isNotNull(taxonomyClusters.centroidEmbedding),
                  ...(parentClusterId === undefined
                    ? []
                    : parentClusterId === null
                      ? [isNull(taxonomyClusters.parentClusterId)]
                      : [eq(taxonomyClusters.parentClusterId, parentClusterId)]),
                ),
              )
              .orderBy(desc(cosine), asc(taxonomyClusters.id))
              .limit(k),
          )

          return rows.map((row) => ({ cluster: toDomainCluster(row), cosine: row.cosine }))
        }),

      hybridSearch: ({ projectId, query, normalizedEmbedding, state, limit, offset }) =>
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
            isNull(taxonomyClusters.customBehaviorId),
            isNull(taxonomyClusters.facetId),
            isNotNull(taxonomyClusters.centroidEmbedding),
            or(gte(score, TAXONOMY_SEARCH_MIN_SCORE), gte(vectorScore, TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY)),
          ]

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

      list: ({ projectId, state, sort, limit, offset, customBehaviorId, facetId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const conditions = [
            eq(taxonomyClusters.organizationId, sqlClient.organizationId),
            eq(taxonomyClusters.projectId, projectId),
            scopeCondition({ customBehaviorId, facetId }),
          ]
          // `staging` is an internal publish-time state; never surface it from
          // list-clusters. An explicit `state` filter still narrows further.
          conditions.push(state ? eq(taxonomyClusters.state, state) : ne(taxonomyClusters.state, "staging"))

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
                  parentClusterId: row.parentClusterId,
                  depth: row.depth,
                  path: row.path,
                  splitLinkThreshold: row.splitLinkThreshold,
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

      swapActiveTree: ({ supersededClusterIds, stagingClusterIds, timestamp }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          if (supersededClusterIds.length === 0 && stagingClusterIds.length === 0) return
          yield* sqlClient.transaction(
            Effect.gen(function* () {
              if (supersededClusterIds.length > 0) {
                yield* sqlClient.query((db, organizationId) =>
                  db
                    .update(taxonomyClusters)
                    .set({ state: "deprecated", updatedAt: timestamp })
                    .where(
                      and(
                        eq(taxonomyClusters.organizationId, organizationId),
                        inArray(taxonomyClusters.id, supersededClusterIds as TaxonomyClusterId[]),
                      ),
                    ),
                )
              }
              if (stagingClusterIds.length > 0) {
                // Guard on `state = 'staging'` so a retry (rows already active)
                // matches nothing and never resurrects a deprecated tree.
                yield* sqlClient.query((db, organizationId) =>
                  db
                    .update(taxonomyClusters)
                    .set({ state: "active", updatedAt: timestamp })
                    .where(
                      and(
                        eq(taxonomyClusters.organizationId, organizationId),
                        eq(taxonomyClusters.state, "staging"),
                        inArray(taxonomyClusters.id, stagingClusterIds as TaxonomyClusterId[]),
                      ),
                    ),
                )
              }
            }),
          )
        }),

      deleteStaging: ({ clusterIds }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          if (clusterIds.length === 0) return
          yield* sqlClient.query((db, organizationId) =>
            db
              .delete(taxonomyClusters)
              .where(
                and(
                  eq(taxonomyClusters.organizationId, organizationId),
                  eq(taxonomyClusters.state, "staging"),
                  inArray(taxonomyClusters.id, clusterIds as TaxonomyClusterId[]),
                ),
              ),
          )
        }),
    }
  }),
)
