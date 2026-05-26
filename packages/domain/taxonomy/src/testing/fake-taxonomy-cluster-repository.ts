import { NotFoundError, type TaxonomyCategoryId, type TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_SEARCH_MIN_SCORE, TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { cosineSimilarity, normalizeTaxonomyCentroid } from "../helpers.ts"
import type { NearestClusterMatch, TaxonomyClusterRepositoryShape } from "../ports/taxonomy-cluster-repository.ts"

export const createFakeTaxonomyClusterRepository = (
  seed: readonly TaxonomyCluster[] = [],
  overrides?: Partial<TaxonomyClusterRepositoryShape>,
) => {
  const clusters = new Map<TaxonomyClusterId, TaxonomyCluster>(seed.map((cluster) => [cluster.id, cluster] as const))

  const repository: TaxonomyClusterRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        const cluster = clusters.get(id)
        if (!cluster) return yield* new NotFoundError({ entity: "TaxonomyCluster", id })
        return cluster
      }),

    listByIds: (ids) =>
      Effect.sync(() =>
        ids.map((id) => clusters.get(id)).filter((cluster): cluster is TaxonomyCluster => cluster !== undefined),
      ),

    listActiveByProject: ({ projectId }) =>
      Effect.sync(() =>
        [...clusters.values()].filter((cluster) => cluster.projectId === projectId && cluster.state === "active"),
      ),

    listNearestActive: ({ projectId, queryVector, k }) =>
      Effect.sync(() => {
        const matches: NearestClusterMatch[] = []
        for (const cluster of clusters.values()) {
          if (cluster.projectId !== projectId || cluster.state !== "active") continue
          const normalized = normalizeTaxonomyCentroid(cluster.centroid)
          if (normalized.length === 0) continue
          matches.push({ cluster, cosine: cosineSimilarity(queryVector, normalized) })
        }
        matches.sort((a, b) => b.cosine - a.cosine)
        return matches.slice(0, k)
      }),

    hybridSearch: ({ projectId, query, normalizedEmbedding, state, parentCategoryId, limit, offset }) =>
      Effect.sync(() =>
        [...clusters.values()]
          .filter(
            (cluster) =>
              cluster.projectId === projectId &&
              cluster.state === (state ?? "active") &&
              (parentCategoryId ? cluster.parentCategoryId === parentCategoryId : true),
          )
          .map((cluster) => {
            const text = `${cluster.name} ${cluster.description}`.toLowerCase()
            const lexical = text.includes(query.toLowerCase()) ? 1 : 0
            const vector = normalizeTaxonomyCentroid(cluster.centroid)
            const cosine = vector.length > 0 ? cosineSimilarity(normalizedEmbedding, vector) : 0
            return { cluster, score: 0.7 * cosine + 0.3 * lexical, cosine }
          })
          .filter(
            ({ score, cosine }) =>
              score >= TAXONOMY_SEARCH_MIN_SCORE || cosine >= TAXONOMY_SEARCH_MIN_VECTOR_SIMILARITY,
          )
          .sort((a, b) => b.score - a.score || a.cluster.id.localeCompare(b.cluster.id))
          .slice(offset, offset + limit)
          .map(({ cluster, score }) => ({
            clusterId: cluster.id,
            name: cluster.name,
            description: cluster.description,
            score,
          })),
      ),

    list: ({ projectId, state, parentCategoryId, sort, limit, offset }) =>
      Effect.sync(() => {
        const filtered = [...clusters.values()]
          .filter(
            (cluster) =>
              cluster.projectId === projectId &&
              (state ? cluster.state === state : true) &&
              (parentCategoryId ? cluster.parentCategoryId === parentCategoryId : true),
          )
          .sort((a, b) => {
            switch (sort ?? "observation_count_desc") {
              case "last_observed_desc":
                return b.lastObservedAt.getTime() - a.lastObservedAt.getTime() || a.id.localeCompare(b.id)
              case "name_asc":
                return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
              case "observation_count_desc":
                return b.observationCount - a.observationCount || a.id.localeCompare(b.id)
            }
            return b.observationCount - a.observationCount || a.id.localeCompare(b.id)
          })
        const window = filtered.slice(offset, offset + limit + 1)
        return {
          items: window.slice(0, limit),
          hasMore: window.length > limit,
          limit,
          offset,
        }
      }),

    save: (cluster) =>
      Effect.sync(() => {
        clusters.set(cluster.id, cluster)
      }),

    bulkUpdateParentCategory: ({ assignments }) =>
      Effect.sync(() => {
        for (const { clusterId, parentCategoryId } of assignments) {
          const existing = clusters.get(clusterId)
          if (existing) {
            clusters.set(clusterId, {
              ...existing,
              parentCategoryId: parentCategoryId as TaxonomyCategoryId | null,
              updatedAt: new Date(),
            })
          }
        }
      }),

    markMerged: ({ clusterId, mergedIntoClusterId, timestamp }) =>
      Effect.sync(() => {
        const existing = clusters.get(clusterId)
        if (existing) {
          clusters.set(clusterId, {
            ...existing,
            state: "merged",
            mergedIntoClusterId,
            updatedAt: timestamp,
          })
        }
      }),

    markDeprecated: ({ clusterId, timestamp }) =>
      Effect.sync(() => {
        const existing = clusters.get(clusterId)
        if (existing) {
          clusters.set(clusterId, { ...existing, state: "deprecated", updatedAt: timestamp })
        }
      }),

    incrementObservationCount: ({ clusterId, delta, lastObservedAt }) =>
      Effect.sync(() => {
        const existing = clusters.get(clusterId)
        if (existing) {
          clusters.set(clusterId, {
            ...existing,
            observationCount: existing.observationCount + delta,
            lastObservedAt,
            updatedAt: new Date(),
          })
        }
      }),

    ...overrides,
  }

  return { repository, clusters }
}
