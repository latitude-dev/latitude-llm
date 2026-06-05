import { OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { nameClusterUseCase } from "@domain/taxonomy"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive } from "@platform/ai-voyage"
import { RedisCacheStoreLive, RedisDistributedLockRepositoryLive } from "@platform/cache-redis"
import { TaxonomyObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { TaxonomyClusterRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

export interface NameTaxonomyClusterActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly clusterId: string
}

export const nameTaxonomyClusterActivity = (input: NameTaxonomyClusterActivityInput) =>
  Effect.runPromise(
    nameClusterUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      clusterId: TaxonomyClusterId(input.clusterId),
    }).pipe(
      withPostgres(TaxonomyClusterRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withClickHouse(TaxonomyObservationRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      Effect.provide(
        Layer.mergeAll(RedisCacheStoreLive(getRedisClient()), RedisDistributedLockRepositoryLive(getRedisClient())),
      ),
    ),
  )
