import { generateId, type OrganizationId, type ProjectId, TaxonomyLineageId, type TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import {
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
  TAXONOMY_MERGE_THRESHOLD,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import { cosineSimilarityNormalized, mergeTaxonomyCentroids, normalizeTaxonomyCentroid } from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface MergeNearDuplicateClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly now?: Date
}

export interface MergeNearDuplicateClustersResult {
  readonly clustersMerged: number
  readonly observationsReassigned: number
  readonly lineage: readonly TaxonomyClusterLineage[]
}

const connectedComponents = (clusters: readonly TaxonomyCluster[]): readonly (readonly TaxonomyCluster[])[] => {
  const n = clusters.length
  const parent = new Array<number>(n)
  for (let index = 0; index < n; index++) parent[index] = index
  const find = (x: number): number => {
    let root = x
    while (parent[root] !== root) {
      const next = parent[root]
      if (next === undefined) return root
      const grandparent = parent[next]
      if (grandparent !== undefined) parent[root] = grandparent
      root = next
    }
    return root
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const vectors = clusters.map((cluster) => normalizeTaxonomyCentroid(cluster.centroid))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const left = vectors[i]
      const right = vectors[j]
      if (left && right && cosineSimilarityNormalized(left, right) >= TAXONOMY_MERGE_THRESHOLD) union(i, j)
    }
  }

  const groups = new Map<number, TaxonomyCluster[]>()
  for (let index = 0; index < n; index++) {
    const root = find(index)
    const cluster = clusters[index]
    if (!cluster) continue
    groups.set(root, [...(groups.get(root) ?? []), cluster])
  }
  return [...groups.values()].filter((group) => group.length >= 2)
}

const chooseSurvivor = (component: readonly TaxonomyCluster[]): TaxonomyCluster =>
  [...component].sort(
    (a, b) => b.observationCount - a.observationCount || a.id.localeCompare(b.id),
  )[0] as TaxonomyCluster

const minPairwiseSimilarity = (component: readonly TaxonomyCluster[]): number => {
  let min = 1
  for (let i = 0; i < component.length; i++) {
    for (let j = i + 1; j < component.length; j++) {
      const left = component[i]
      const right = component[j]
      if (!left || !right) continue
      min = Math.min(
        min,
        cosineSimilarityNormalized(normalizeTaxonomyCentroid(left.centroid), normalizeTaxonomyCentroid(right.centroid)),
      )
    }
  }
  return min
}

export const mergeNearDuplicateClustersUseCase = (input: MergeNearDuplicateClustersInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* BehaviorObservationRepository
    const active = yield* clusters.listActiveByProject({
      projectId: input.projectId,
    })
    const components = connectedComponents(active)

    let clustersMerged = 0
    let observationsReassigned = 0
    const lineage: TaxonomyClusterLineage[] = []

    for (const component of components) {
      const survivor = chooseSurvivor(component)
      const componentResult = yield* withTaxonomyClusterLock(
        { organizationId: input.organizationId, clusterId: survivor.id, ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS },
        Effect.gen(function* () {
          const losers = component.filter((cluster) => cluster.id !== survivor.id)
          let updatedSurvivor = yield* clusters.findById(survivor.id)
          const loserIds = losers.map((cluster) => cluster.id)
          let reassigned = 0

          for (const loser of losers) {
            const similarity = cosineSimilarityNormalized(
              normalizeTaxonomyCentroid(survivor.centroid),
              normalizeTaxonomyCentroid(loser.centroid),
            )
            const loserObservations = yield* observations.listAllByCluster({
              organizationId: input.organizationId,
              projectId: input.projectId,
              clusterId: loser.id,
              limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
            })

            const mergedCentroid = mergeTaxonomyCentroids({
              survivor: { ...updatedSurvivor.centroid, clusteredAt: updatedSurvivor.clusteredAt },
              loser: { ...loser.centroid, clusteredAt: loser.clusteredAt },
              timestamp: now,
            })
            updatedSurvivor = {
              ...updatedSurvivor,
              centroid: mergedCentroid,
              clusteredAt: mergedCentroid.clusteredAt,
              observationCount: updatedSurvivor.observationCount + loser.observationCount,
              lastObservedAt:
                loser.lastObservedAt > updatedSurvivor.lastObservedAt
                  ? loser.lastObservedAt
                  : updatedSurvivor.lastObservedAt,
              updatedAt: now,
            }

            yield* observations.reassignMany(
              loserObservations.map((observation) => ({
                observation,
                assignedClusterId: survivor.id,
                assignmentMethod: "gardening_reassign",
                assignmentConfidence: similarity,
                reassignmentRunId: input.runId,
                indexedAt: now,
              })),
            )
            yield* clusters.markMerged({ clusterId: loser.id, mergedIntoClusterId: survivor.id, timestamp: now })
            reassigned += loserObservations.length
          }

          yield* clusters.save(updatedSurvivor)
          return {
            merged: losers.length,
            reassigned,
            lineage: {
              id: TaxonomyLineageId(generateId()),
              organizationId: input.organizationId,
              projectId: input.projectId,
              runId: input.runId,
              transitionType: "merge",
              fromClusterIds: loserIds,
              toClusterIds: [survivor.id],
              similarity: minPairwiseSimilarity(component),
              createdAt: now,
            } satisfies TaxonomyClusterLineage,
          }
        }),
      )

      clustersMerged += componentResult.merged
      observationsReassigned += componentResult.reassigned
      lineage.push(componentResult.lineage)
    }

    return { clustersMerged, observationsReassigned, lineage } satisfies MergeNearDuplicateClustersResult
  }).pipe(Effect.withSpan("taxonomy.mergeNearDuplicateClusters"))
