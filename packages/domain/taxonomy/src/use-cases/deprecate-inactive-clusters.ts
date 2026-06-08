import {
  applyDecay,
  generateId,
  type OrganizationId,
  type ProjectId,
  TaxonomyLineageId,
  type TaxonomyRunId,
} from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS, TAXONOMY_DEAD_CLUSTER_MASS_FLOOR } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface DeprecateInactiveClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface DeprecateInactiveClustersResult {
  readonly clustersDeprecated: number
  readonly lineage: readonly TaxonomyClusterLineage[]
}

const inactivityCutoff = (now: Date): Date =>
  new Date(now.getTime() - TAXONOMY_DEAD_CLUSTER_INACTIVITY_DAYS * 24 * 60 * 60_000)

const decayedMassAt = (cluster: TaxonomyCluster, now: Date): number =>
  applyDecay(
    new Float32Array(cluster.centroid.base),
    cluster.centroid.mass,
    cluster.clusteredAt,
    now,
    cluster.centroid.decay,
  )

export const deprecateInactiveClustersUseCase = (input: DeprecateInactiveClustersInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const cutoff = inactivityCutoff(now)
    const clusters = yield* TaxonomyClusterRepository
    const activeClusters = yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension,
    })
    const lineage: TaxonomyClusterLineage[] = []
    // A parent cannot die while children live; it deprecates only once its
    // subtree has emptied.
    const parentsWithChildren = new Set(
      activeClusters
        .map((cluster) => cluster.parentClusterId)
        .filter((id): id is NonNullable<typeof id> => id !== null),
    )

    for (const cluster of activeClusters) {
      if (parentsWithChildren.has(cluster.id)) continue
      if (cluster.lastObservedAt > cutoff) continue
      if (decayedMassAt(cluster, now) >= TAXONOMY_DEAD_CLUSTER_MASS_FLOOR) continue

      yield* clusters.markDeprecated({ clusterId: cluster.id, timestamp: now })
      lineage.push({
        id: TaxonomyLineageId(generateId()),
        organizationId: input.organizationId,
        projectId: input.projectId,
        dimension: cluster.dimension,
        runId: input.runId,
        transitionType: "death",
        fromClusterIds: [cluster.id],
        toClusterIds: [],
        similarity: null,
        createdAt: now,
      })
    }

    return { clustersDeprecated: lineage.length, lineage } satisfies DeprecateInactiveClustersResult
  }).pipe(Effect.withSpan("taxonomy.deprecateInactiveClusters"))
