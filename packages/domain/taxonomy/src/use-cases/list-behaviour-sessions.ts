import type { CustomBehaviorId, OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import {
  type ClusterSessionMomentRange,
  type ClusterSessionsPage,
  TaxonomyClusterIntelligenceRepository,
} from "../ports/taxonomy-cluster-intelligence-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface ListBehaviourSessionsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyClusterId
  /** "all" or a single moment kind the session must contain. */
  readonly filter?: string
  readonly momentRange?: ClusterSessionMomentRange
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly offset?: number
  readonly limit?: number
  /** Omit/null = global taxonomy; an id reads that behavior's scoped slice. */
  readonly customBehaviorId?: CustomBehaviorId | null
}

const EMPTY_PAGE: ClusterSessionsPage = { sessions: [], histogram: [], hasMore: false, nextOffset: null }

/**
 * One page of a behaviour node's sessions (its whole subtree), honouring the
 * drawer's moment-kind / turn-range / time filters. Resolves the subtree in
 * Postgres, then reads sessions from ClickHouse — the global taxonomy or, when
 * `customBehaviorId` is set, the behavior's scoped assignment slice.
 */
export const listBehaviourSessionsUseCase = (input: ListBehaviourSessionsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const clusters = yield* TaxonomyClusterRepository
    const intelligence = yield* TaxonomyClusterIntelligenceRepository
    const scope = input.customBehaviorId != null ? { customBehaviorId: input.customBehaviorId } : {}
    const clusterIds = yield* clusters.listSubtreeIds({
      projectId: input.projectId,
      clusterId: input.clusterId,
      ...scope,
    })
    if (clusterIds.length === 0) return EMPTY_PAGE
    return yield* intelligence.listClusterSessions({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterIds,
      filter: input.filter ?? "all",
      ...(input.momentRange ? { momentRange: input.momentRange } : {}),
      ...(input.startTimeFrom ? { startTimeFrom: input.startTimeFrom } : {}),
      ...(input.startTimeTo ? { startTimeTo: input.startTimeTo } : {}),
      offset: input.offset ?? 0,
      limit: input.limit ?? 50,
      ...scope,
    })
  }).pipe(Effect.withSpan("taxonomy.listBehaviourSessions"))
