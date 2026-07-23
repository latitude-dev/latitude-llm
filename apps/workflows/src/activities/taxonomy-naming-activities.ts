import { CustomBehaviorId, OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { nameClusterUseCase, nameCustomBehaviorClusterUseCase } from "@domain/taxonomy"
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
import { TaxonomyClusterRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { billingMeteringRepositoriesLive, withActivityAIMetering } from "./ai-metering.ts"

export interface NameTaxonomyClusterActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly clusterId: string
  /** Present ⇒ name within a custom behavior's scoped member source; absent ⇒ the global tree. */
  readonly customBehaviorId?: string
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
    nameClusterUseCase({ organizationId, projectId, clusterId }).pipe(
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
