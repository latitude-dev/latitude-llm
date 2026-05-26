import { type OrganizationId, type ProjectId, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_CLUSTER_LOCK_TTL_SECONDS } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyClusterNotFoundError } from "../errors.ts"
import { updateTaxonomyCentroid } from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyLockRepository } from "../ports/taxonomy-lock-repository.ts"

export interface AssignObservationToClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: string
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

export const assignObservationToClusterUseCase = (input: AssignObservationToClusterInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const lockRepository = yield* TaxonomyLockRepository
    const clusterRepository = yield* TaxonomyClusterRepository
    const clusterId = TaxonomyClusterId(input.clusterId)

    return yield* lockRepository.withClusterLock(
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
        const updated = applyObservationToCluster(cluster, input, input.assignedAt ?? new Date())
        yield* clusterRepository.save(updated)
        return updated
      }),
    )
  }).pipe(Effect.withSpan("taxonomy.assignObservationToCluster"))
