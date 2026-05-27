import { OrganizationId, ProjectId, TaxonomyCategoryId, TaxonomyClusterId } from "@domain/shared"
import { nameCategoryUseCase, nameClusterUseCase } from "@domain/taxonomy"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive } from "@platform/ai-voyage"
import { RedisCacheStoreLive, RedisTaxonomyLockRepositoryLive } from "@platform/cache-redis"
import { BehaviorObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { TaxonomyCategoryRepositoryLive, TaxonomyClusterRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

export interface NameTaxonomyClusterActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly clusterId: string
}

export interface NameTaxonomyCategoryActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly categoryId: string
}

export const nameTaxonomyClusterActivity = (input: NameTaxonomyClusterActivityInput) =>
  Effect.runPromise(
    nameClusterUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      clusterId: TaxonomyClusterId(input.clusterId),
    }).pipe(
      withPostgres(TaxonomyClusterRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withClickHouse(BehaviorObservationRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      Effect.provide(
        Layer.mergeAll(RedisCacheStoreLive(getRedisClient()), RedisTaxonomyLockRepositoryLive(getRedisClient())),
      ),
    ),
  )

export const nameTaxonomyCategoryActivity = (input: NameTaxonomyCategoryActivityInput) =>
  Effect.runPromise(
    nameCategoryUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      categoryId: TaxonomyCategoryId(input.categoryId),
    }).pipe(
      withPostgres(
        Layer.mergeAll(TaxonomyCategoryRepositoryLive, TaxonomyClusterRepositoryLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      Effect.provide(
        Layer.mergeAll(RedisCacheStoreLive(getRedisClient()), RedisTaxonomyLockRepositoryLive(getRedisClient())),
      ),
    ),
  )
