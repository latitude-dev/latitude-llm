import { generateId, type OrganizationId, type ProjectId, TaxonomyLineageId, type TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_LIST_ALL_BY_CLUSTER_MAX } from "../constants.ts"
import { TaxonomyClusterState } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import { cosineSimilarityNormalized, normalizeTaxonomyCentroid, normalizeTaxonomyEmbedding } from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"

export interface ReconcileClusterCountsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface ReconcileClusterCountsResult {
  readonly clustersScanned: number
  readonly clustersUpdated: number
  readonly clustersDeprecated: number
  readonly lineage: readonly TaxonomyClusterLineage[]
}

/**
 * Rebuilds Postgres cluster counters from ClickHouse's current observation
 * assignment state. Gardening moves observations between clusters, so counters
 * are derived state and must not be trusted as the source of truth.
 */
export const reconcileClusterCountsUseCase = (input: ReconcileClusterCountsInput) =>
  Effect.gen(function* () {
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* TaxonomyObservationRepository
    const active = yield* clusters.listActiveByProject({ projectId: input.projectId, dimension })
    const parentsWithChildren = new Set(
      active.flatMap((cluster) => (cluster.parentClusterId ? [cluster.parentClusterId] : [])),
    )
    const childrenByParentId = new Map<string, (typeof active)[number][]>()
    for (const cluster of active) {
      if (!cluster.parentClusterId) continue
      const children = childrenByParentId.get(cluster.parentClusterId) ?? []
      children.push(cluster)
      childrenByParentId.set(cluster.parentClusterId, children)
    }

    for (const [parentId, children] of childrenByParentId) {
      const parent = active.find((cluster) => cluster.id === parentId)
      if (!parent) continue
      const directRows = yield* observations.listAllByCluster({
        organizationId: input.organizationId,
        projectId: input.projectId,
        clusterId: parent.id,
        limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
      })
      yield* observations.reassignMany(
        directRows.flatMap((observation) => {
          const embedding = normalizeTaxonomyEmbedding(observation.embedding)
          const target = [...children].sort(
            (a, b) =>
              cosineSimilarityNormalized(normalizeTaxonomyCentroid(b.centroid), embedding) -
              cosineSimilarityNormalized(normalizeTaxonomyCentroid(a.centroid), embedding),
          )[0]
          return target
            ? [
                {
                  observation,
                  assignedClusterId: target.id,
                  assignmentMethod: "gardening_reassign" as const,
                  assignmentConfidence: cosineSimilarityNormalized(
                    normalizeTaxonomyCentroid(target.centroid),
                    embedding,
                  ),
                  reassignmentRunId: input.runId,
                  indexedAt: now,
                },
              ]
            : []
        }),
      )
    }

    const countsAfterEvacuation = yield* observations.getClusterAssignmentCounts({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterIds: active.map((cluster) => cluster.id),
    })
    const directCountByClusterId = new Map(countsAfterEvacuation.map((count) => [count.clusterId, count] as const))
    const aggregateCountByClusterId = new Map<
      string,
      { readonly count: number; readonly firstObservedAt: Date; readonly lastObservedAt: Date }
    >()

    for (const cluster of active) {
      const descendantCounts = active.flatMap((candidate) => {
        if (candidate.id !== cluster.id && !candidate.path.includes(`${cluster.id}/`)) return []
        const count = directCountByClusterId.get(candidate.id)
        return count ? [count] : []
      })
      if (descendantCounts.length === 0) continue
      aggregateCountByClusterId.set(cluster.id, {
        count: descendantCounts.reduce((sum, count) => sum + count.count, 0),
        firstObservedAt: new Date(Math.min(...descendantCounts.map((count) => count.firstObservedAt.getTime()))),
        lastObservedAt: new Date(Math.max(...descendantCounts.map((count) => count.lastObservedAt.getTime()))),
      })
    }

    const lineage: TaxonomyClusterLineage[] = []
    let clustersUpdated = 0

    for (const cluster of active) {
      const count = parentsWithChildren.has(cluster.id)
        ? aggregateCountByClusterId.get(cluster.id)
        : directCountByClusterId.get(cluster.id)
      if (!count) {
        if (parentsWithChildren.has(cluster.id)) {
          if (cluster.observationCount !== 0) {
            yield* clusters.save({ ...cluster, observationCount: 0, updatedAt: now })
            clustersUpdated += 1
          }
        } else {
          yield* clusters.markDeprecated({ clusterId: cluster.id, timestamp: now })
          lineage.push({
            id: TaxonomyLineageId(generateId()),
            organizationId: input.organizationId,
            projectId: input.projectId,
            dimension,
            runId: input.runId,
            transitionType: "death",
            fromClusterIds: [cluster.id],
            toClusterIds: [],
            similarity: null,
            createdAt: now,
          })
        }
        continue
      }

      if (
        cluster.observationCount === count.count &&
        cluster.firstObservedAt.getTime() === count.firstObservedAt.getTime() &&
        cluster.lastObservedAt.getTime() === count.lastObservedAt.getTime()
      ) {
        continue
      }

      yield* clusters.save({
        ...cluster,
        observationCount: count.count,
        firstObservedAt: count.firstObservedAt,
        lastObservedAt: count.lastObservedAt,
        state: TaxonomyClusterState.Active,
        updatedAt: now,
      })
      clustersUpdated += 1
    }

    return {
      clustersScanned: active.length,
      clustersUpdated,
      clustersDeprecated: lineage.length,
      lineage,
    } satisfies ReconcileClusterCountsResult
  }).pipe(Effect.withSpan("taxonomy.reconcileClusterCounts"))
