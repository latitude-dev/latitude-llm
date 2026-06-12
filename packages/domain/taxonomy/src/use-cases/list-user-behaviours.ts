import type { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension } from "../entities/dimension.ts"
import { isDisplayableTaxonomyName } from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"

export interface ListUserBehavioursInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly userId: ExternalUserId
  readonly limit?: number
}

export interface UserBehaviourItem {
  readonly cluster: TaxonomyCluster
  /** Observations on the user's sessions assigned to this cluster. */
  readonly observationCount: number
  readonly firstObservedAt: Date
  readonly lastObservedAt: Date
}

export type ListUserBehavioursError = RepositoryError

const DEFAULT_LIMIT = 12

/**
 * Behaviour clusters observed on one end-user's sessions, ordered by how often
 * the user exhibits them. Counts are user-scoped; cluster identity (name,
 * description) comes from the project taxonomy. Non-displayable and inactive
 * clusters are dropped.
 */
export const listUserBehavioursUseCase = (
  input: ListUserBehavioursInput,
): Effect.Effect<
  readonly UserBehaviourItem[],
  ListUserBehavioursError,
  ChSqlClient | SqlClient | TaxonomyClusterRepository | TaxonomyObservationRepository
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const limit = Math.max(input.limit ?? DEFAULT_LIMIT, 1)

    const clusterRepository = yield* TaxonomyClusterRepository
    const observationRepository = yield* TaxonomyObservationRepository

    const counts = yield* observationRepository.getClusterCountsByUser({
      organizationId: input.organizationId,
      projectId: input.projectId,
      userId: input.userId,
    })
    if (counts.length === 0) return []

    const activeClusters = yield* clusterRepository.listActiveByProject({
      projectId: input.projectId,
      dimension: TaxonomyDimension.Topic,
    })
    const clusterById = new Map(activeClusters.map((cluster) => [cluster.id, cluster] as const))

    return counts
      .flatMap((count): UserBehaviourItem[] => {
        const cluster = clusterById.get(count.clusterId)
        if (!cluster || !isDisplayableTaxonomyName(cluster.name)) return []
        return [
          {
            cluster,
            observationCount: count.count,
            firstObservedAt: count.firstObservedAt,
            lastObservedAt: count.lastObservedAt,
          },
        ]
      })
      .slice(0, limit)
  }).pipe(Effect.withSpan("taxonomy.listUserBehaviours"))
