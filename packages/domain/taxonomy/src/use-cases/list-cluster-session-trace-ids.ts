import type { OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import type { ClusterSessionMomentRange } from "../ports/taxonomy-cluster-intelligence-repository.ts"
import { TaxonomyClusterIntelligenceRepository } from "../ports/taxonomy-cluster-intelligence-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface ListClusterSessionTraceIdsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyClusterId
  /** "all" or a single moment kind the session must contain. */
  readonly filter?: string
  readonly momentRange?: ClusterSessionMomentRange
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly limit: number
}

/**
 * Resolves a cluster (its whole subtree) to one trace id per assigned session,
 * honouring the Behaviours drawer's moment-kind / turn-range / time filters.
 * Shared by the manual "Add to dataset" export and the auto-feed pipeline.
 */
export const listClusterSessionTraceIdsUseCase = (input: ListClusterSessionTraceIdsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const clusters = yield* TaxonomyClusterRepository
    const intelligence = yield* TaxonomyClusterIntelligenceRepository
    // A tree node represents its whole subtree: sessions are assigned to leaves.
    const clusterIds = yield* clusters.listSubtreeIds({ projectId: input.projectId, clusterId: input.clusterId })
    return yield* intelligence.listSessionTraceIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterIds,
      filter: input.filter ?? "all",
      ...(input.momentRange ? { momentRange: input.momentRange } : {}),
      ...(input.startTimeFrom ? { startTimeFrom: input.startTimeFrom } : {}),
      ...(input.startTimeTo ? { startTimeTo: input.startTimeTo } : {}),
      limit: input.limit,
    })
  }).pipe(Effect.withSpan("taxonomy.listClusterSessionTraceIds"))
