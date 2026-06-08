import { type OrganizationId, type ProjectId, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_CLUSTER_LOCK_TTL_SECONDS } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyClusterNotFoundError } from "../errors.ts"
import { updateTaxonomyCentroid } from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface AssignObservationToClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: string
  readonly embedding: readonly number[]
  readonly observedAt: Date
  readonly assignedAt?: Date
}

export interface ReplaceObservationInClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: string
  readonly previousEmbedding: readonly number[]
  readonly previousObservedAt: Date
  readonly embedding: readonly number[]
  readonly observedAt: Date
  readonly assignedAt?: Date
}

const applyObservationToCluster = (
  cluster: TaxonomyCluster,
  input: AssignObservationToClusterInput,
  assignedAt: Date,
): TaxonomyCluster => {
  const centroid = updateTaxonomyCentroid({
    centroid: { ...cluster.centroid, clusteredAt: cluster.clusteredAt },
    embedding: input.embedding,
    weight: 1,
    timestamp: input.observedAt,
    operation: "add",
    previousClusteredAt: cluster.clusteredAt,
  })

  return {
    ...cluster,
    centroid,
    clusteredAt: centroid.clusteredAt,
    observationCount: cluster.observationCount + 1,
    lastObservedAt: input.observedAt,
    updatedAt: assignedAt,
  }
}

/** Follows at most this many merge redirects before giving up. */
const MAX_MERGE_REDIRECTS = 3

const replaceObservationInActiveCluster = (
  cluster: TaxonomyCluster,
  input: ReplaceObservationInClusterInput,
  assignedAt: Date,
): TaxonomyCluster => {
  const removed = updateTaxonomyCentroid({
    centroid: { ...cluster.centroid, clusteredAt: cluster.clusteredAt },
    embedding: input.previousEmbedding,
    weight: 1,
    timestamp: input.previousObservedAt,
    operation: "remove",
    previousClusteredAt: cluster.clusteredAt,
  })
  const centroid = updateTaxonomyCentroid({
    centroid: removed,
    embedding: input.embedding,
    weight: 1,
    timestamp: input.observedAt,
    operation: "add",
    previousClusteredAt: removed.clusteredAt,
  })

  return {
    ...cluster,
    centroid,
    clusteredAt: centroid.clusteredAt,
    observationCount: Math.max(1, cluster.observationCount),
    lastObservedAt: input.observedAt,
    updatedAt: assignedAt,
  }
}

export const assignObservationToClusterUseCase = (input: AssignObservationToClusterInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const clusterRepository = yield* TaxonomyClusterRepository

    // The cluster can merge or deprecate between routing and lock
    // acquisition; writing the stale snapshot back would resurrect it.
    // Merged clusters redirect the increment to their survivor.
    let clusterId = TaxonomyClusterId(input.clusterId)
    for (let redirects = 0; redirects <= MAX_MERGE_REDIRECTS; redirects++) {
      const result = yield* withTaxonomyClusterLock(
        {
          organizationId: input.organizationId,
          clusterId,
          ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
        },
        Effect.gen(function* () {
          const cluster = yield* clusterRepository.findById(clusterId)
          if (cluster.organizationId !== input.organizationId || cluster.projectId !== input.projectId) {
            return yield* new TaxonomyClusterNotFoundError({ clusterId: input.clusterId })
          }
          if (cluster.state === "merged" && cluster.mergedIntoClusterId !== null) {
            return { redirectTo: cluster.mergedIntoClusterId } as const
          }
          if (cluster.state !== "active") return { dropped: true } as const
          const updated = applyObservationToCluster(cluster, input, input.assignedAt ?? new Date())
          yield* clusterRepository.save(updated)
          return { updated } as const
        }),
      )
      if ("updated" in result) return result.updated
      if ("dropped" in result) return null
      clusterId = TaxonomyClusterId(result.redirectTo)
    }
    return null
  }).pipe(Effect.withSpan("taxonomy.assignObservationToCluster"))

export const replaceObservationInClusterUseCase = (input: ReplaceObservationInClusterInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const clusterRepository = yield* TaxonomyClusterRepository
    const clusterId = TaxonomyClusterId(input.clusterId)

    return yield* withTaxonomyClusterLock(
      {
        organizationId: input.organizationId,
        clusterId,
        ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
      },
      Effect.gen(function* () {
        const cluster = yield* clusterRepository.findById(clusterId)
        if (cluster.organizationId !== input.organizationId || cluster.projectId !== input.projectId) {
          return yield* new TaxonomyClusterNotFoundError({ clusterId: input.clusterId })
        }
        if (cluster.state !== "active") return null
        const updated = replaceObservationInActiveCluster(cluster, input, input.assignedAt ?? new Date())
        yield* clusterRepository.save(updated)
        return updated
      }),
    )
  }).pipe(Effect.withSpan("taxonomy.replaceObservationInCluster"))
