import { generateId, type OrganizationId, type ProjectId, TaxonomyLineageId, type TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_CLUSTER_LOCK_TTL_SECONDS } from "../constants.ts"
import { TaxonomyClusterState } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
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

    const assignmentCounts = yield* observations.getClusterAssignmentCounts({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterIds: active.map((cluster) => cluster.id),
    })
    const directCountByClusterId = new Map(assignmentCounts.map((count) => [count.clusterId, count] as const))
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
            // Save under the cluster lock against a fresh read: live online
            // assignment mutates centroid/counters on the same row concurrently
            // and a stale full-row upsert here would clobber those updates.
            yield* withTaxonomyClusterLock(
              {
                organizationId: input.organizationId,
                clusterId: cluster.id,
                ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
              },
              Effect.gen(function* () {
                const fresh = yield* clusters.findById(cluster.id)
                yield* clusters.save({ ...fresh, observationCount: 0, updatedAt: now })
              }),
            )
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

      // Save under the cluster lock against a fresh read: live online
      // assignment mutates centroid/counters on the same row concurrently
      // and a stale full-row upsert here would clobber those updates.
      yield* withTaxonomyClusterLock(
        { organizationId: input.organizationId, clusterId: cluster.id, ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS },
        Effect.gen(function* () {
          const fresh = yield* clusters.findById(cluster.id)
          yield* clusters.save({
            ...fresh,
            observationCount: count.count,
            firstObservedAt: count.firstObservedAt,
            lastObservedAt: count.lastObservedAt,
            state: TaxonomyClusterState.Active,
            updatedAt: now,
          })
        }),
      )
      clustersUpdated += 1
    }

    return {
      clustersScanned: active.length,
      clustersUpdated,
      clustersDeprecated: lineage.length,
      lineage,
    } satisfies ReconcileClusterCountsResult
  }).pipe(Effect.withSpan("taxonomy.reconcileClusterCounts"))
