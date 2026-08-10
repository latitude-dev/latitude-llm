import type { CustomBehaviorId, FacetId, OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import {
  type ClusterTrajectoryAxis,
  type ClusterTrajectoryRow,
  TaxonomyClusterIntelligenceRepository,
} from "../ports/taxonomy-cluster-intelligence-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface GetBehaviourTrajectoryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly categoryClusterIds: readonly TaxonomyClusterId[]
  readonly axis: ClusterTrajectoryAxis
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  /** Omit/null = global taxonomy; an id reads that behavior's scoped slice. */
  readonly customBehaviorId?: CustomBehaviorId | null
  /** The behavior's facet; omit/null = topic edges, a facet id = that facet's edges. */
  readonly facetId?: FacetId | null
}

export interface BehaviourTrajectoryCategoryRow extends ClusterTrajectoryRow {
  readonly categoryClusterId: string
}

export interface BehaviourTrajectoryResult {
  readonly buckets: readonly string[]
  readonly rows: readonly BehaviourTrajectoryCategoryRow[]
}

/**
 * Moment-metric trajectory for one or more category subtrees. Resolves each
 * category's subtree in Postgres and reads its per-bucket counts from ClickHouse
 * (global or the scoped slice), tagging rows by category and unioning the bucket
 * axis (lexical for days, numeric for turns).
 */
export const getBehaviourTrajectoryUseCase = (input: GetBehaviourTrajectoryInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const categoryClusterIds = [...new Set(input.categoryClusterIds)]
    if (categoryClusterIds.length === 0) return { buckets: [], rows: [] } satisfies BehaviourTrajectoryResult

    const clusters = yield* TaxonomyClusterRepository
    const intelligence = yield* TaxonomyClusterIntelligenceRepository
    // Each id is spread on its own merit: the two are independent optionals on this
    // contract, so nesting the facet inside the behavior check would silently read
    // topic edges for a caller that passed a facet without a behavior.
    const scope = {
      ...(input.customBehaviorId != null ? { customBehaviorId: input.customBehaviorId } : {}),
      ...(input.facetId != null ? { facetId: input.facetId } : {}),
    }

    const perCategory = yield* Effect.forEach(
      categoryClusterIds,
      (categoryClusterId) =>
        Effect.gen(function* () {
          const clusterIds = yield* clusters.listSubtreeIds({
            projectId: input.projectId,
            clusterId: categoryClusterId,
            ...scope,
          })
          const rows = yield* intelligence.getClusterTrajectory({
            organizationId: input.organizationId,
            projectId: input.projectId,
            clusterIds,
            axis: input.axis,
            ...(input.startTimeFrom ? { startTimeFrom: input.startTimeFrom } : {}),
            ...(input.startTimeTo ? { startTimeTo: input.startTimeTo } : {}),
            ...scope,
          })
          return rows.map(
            (row): BehaviourTrajectoryCategoryRow => ({ ...row, categoryClusterId: categoryClusterId as string }),
          )
        }),
      { concurrency: 6 },
    )

    const rows = perCategory.flat()
    const buckets = [...new Set(rows.map((row) => row.bucket))].sort((left, right) =>
      input.axis === "day" ? left.localeCompare(right) : Number(left) - Number(right),
    )
    return { buckets, rows } satisfies BehaviourTrajectoryResult
  }).pipe(Effect.withSpan("taxonomy.getBehaviourTrajectory"))
