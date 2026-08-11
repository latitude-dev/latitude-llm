import { CustomBehaviorId, FacetId, OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import {
  FacetRepository,
  nameClusterUseCase,
  nameCustomBehaviorClusterUseCase,
  nameFacetClusterUseCase,
} from "@domain/taxonomy"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import {
  RedisBillingSpendReservationLive,
  RedisCacheStoreLive,
  RedisDistributedLockRepositoryLive,
} from "@platform/cache-redis"
import {
  TaxonomyObservationRepositoryLive,
  TaxonomyViewAssignmentRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { FacetRepositoryLive, TaxonomyClusterRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { billingMeteringRepositoriesLive, withActivityAIMetering } from "./ai-metering.ts"

export interface NameTaxonomyClusterActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly clusterId: string
  /** Present ⇒ name within a custom behavior's scoped member source; absent ⇒ the whole-project tree. */
  readonly customBehaviorId?: string
  /** Present ⇒ a facet-scoped view: read members from `taxonomy_facet_projections` and name in the facet's voice. */
  readonly facetId?: string
  /**
   * Naming sample for a `staging` cluster named before the publish swap, when
   * `assigned_cluster_id` does not point at it yet. Whole-project topic tree only.
   */
  readonly memberObservationIds?: readonly string[]
  /**
   * The naming plan's samples for every cluster of this pass. Contrastive naming
   * names a whole sibling set in one call, and a staged sibling's membership is not
   * in ClickHouse yet, so without this map a staged tree can only be named per child.
   */
  readonly memberObservationIdsByClusterId?: Readonly<Record<string, readonly string[]>>
}

export const nameTaxonomyClusterActivity = (input: NameTaxonomyClusterActivityInput) => {
  const organizationId = OrganizationId(input.organizationId)
  const projectId = ProjectId(input.projectId)
  const clusterId = TaxonomyClusterId(input.clusterId)
  const clickHouse = Layer.mergeAll(TaxonomyObservationRepositoryLive, TaxonomyViewAssignmentRepositoryLive)
  const cache = Layer.mergeAll(
    RedisCacheStoreLive(getRedisClient()),
    RedisDistributedLockRepositoryLive(getRedisClient()),
  )

  if (input.facetId) {
    // Resolve the per-tree naming policy from the facet: load its instructions +
    // name (Postgres), then name the cluster from its extracted facet projections.
    return Effect.runPromise(
      Effect.gen(function* () {
        const facets = yield* FacetRepository
        const facet = yield* facets.findById(FacetId(input.facetId as string))
        // Every facet view is behavior-wrapped, so customBehaviorId is always present here.
        return yield* nameFacetClusterUseCase({
          organizationId,
          projectId,
          facet,
          clusterId,
          customBehaviorId: CustomBehaviorId(input.customBehaviorId as string),
        })
      }).pipe(
        Effect.asVoid,
        withActivityAIMetering({
          organizationId: input.organizationId,
          projectId: input.projectId,
          label: "taxonomy-name",
        }),
        withPostgres(
          Layer.mergeAll(TaxonomyClusterRepositoryLive, FacetRepositoryLive, billingMeteringRepositoriesLive),
          getPostgresClient(),
          organizationId,
        ),
        Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
        withClickHouse(clickHouse, getClickhouseClient(), organizationId),
        withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
        Effect.provide(cache),
      ),
    )
  }

  if (input.customBehaviorId) {
    return Effect.runPromise(
      nameCustomBehaviorClusterUseCase({
        organizationId,
        projectId,
        clusterId,
        customBehaviorId: CustomBehaviorId(input.customBehaviorId),
      }).pipe(
        Effect.asVoid,
        withActivityAIMetering({
          organizationId: input.organizationId,
          projectId: input.projectId,
          label: "taxonomy-name",
        }),
        withPostgres(
          Layer.mergeAll(TaxonomyClusterRepositoryLive, billingMeteringRepositoriesLive),
          getPostgresClient(),
          organizationId,
        ),
        Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
        withClickHouse(clickHouse, getClickhouseClient(), organizationId),
        withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
        Effect.provide(cache),
      ),
    )
  }
  return Effect.runPromise(
    nameClusterUseCase({
      organizationId,
      projectId,
      clusterId,
      ...(input.memberObservationIds ? { memberObservationIds: input.memberObservationIds } : {}),
      ...(input.memberObservationIdsByClusterId
        ? { memberObservationIdsByClusterId: input.memberObservationIdsByClusterId }
        : {}),
    }).pipe(
      Effect.asVoid,
      withActivityAIMetering({
        organizationId: input.organizationId,
        projectId: input.projectId,
        label: "taxonomy-name",
      }),
      withPostgres(
        Layer.mergeAll(TaxonomyClusterRepositoryLive, billingMeteringRepositoriesLive),
        getPostgresClient(),
        organizationId,
      ),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      withClickHouse(clickHouse, getClickhouseClient(), organizationId),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      Effect.provide(cache),
    ),
  )
}
