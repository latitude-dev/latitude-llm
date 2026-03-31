import { AIVoyageLive, createVoyageClientEffect } from "@platform/ai-voyage"
import { createRedisClient, createRedisConnection, RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { createWeaviateClientEffect, IssueProjectionRepositoryLive } from "@platform/db-weaviate"
import { Effect, Layer } from "effect"

let postgresClientInstance: PostgresClient | undefined
let redisInstance: RedisClient | undefined
let issueDiscoveryAiLayerEffect: ReturnType<typeof createVoyageClientEffect> | undefined
let issueProjectionRepositoryLayerEffect: ReturnType<typeof createWeaviateClientEffect> | undefined

export const getPostgresClient = (): PostgresClient => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }
  return postgresClientInstance
}

const getRedisClient = (): RedisClient => {
  if (!redisInstance) {
    redisInstance = createRedisClient(createRedisConnection())
  }
  return redisInstance
}

export const getIssueDiscoveryAiLayerEffect = () => {
  if (!issueDiscoveryAiLayerEffect) {
    issueDiscoveryAiLayerEffect = createVoyageClientEffect()
  }

  return issueDiscoveryAiLayerEffect.pipe(
    Effect.map((voyageClient) =>
      AIVoyageLive(voyageClient).pipe(Layer.provideMerge(RedisCacheStoreLive(getRedisClient()))),
    ),
  )
}

export const getIssueProjectionRepositoryLayerEffect = () => {
  if (!issueProjectionRepositoryLayerEffect) {
    issueProjectionRepositoryLayerEffect = createWeaviateClientEffect()
  }

  return issueProjectionRepositoryLayerEffect.pipe(
    Effect.map((weaviateClient) => IssueProjectionRepositoryLive(weaviateClient)),
  )
}
