import {
  AI,
  type AICredentialError,
  type AIError,
  type EmbedInput,
  type EmbedResult,
  type GenerateInput,
  type GenerateResult,
  type RerankInput,
  type RerankResult,
} from "@domain/ai"
import { AICredentialsLive } from "@platform/ai-credentials"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIVoyageLive, type CreateVoyageClientError, createVoyageClientEffect } from "@platform/ai-voyage"
import { createRedisClient, createRedisConnection, RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import { type ClickHouseClient, createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { createWeaviateClientEffect, IssueProjectionRepositoryLive } from "@platform/db-weaviate"
import { Effect, Layer } from "effect"

let postgresClientInstance: PostgresClient | undefined
let clickhouseClientInstance: ClickHouseClient | undefined
let redisInstance: RedisClient | undefined
let issueDiscoveryAiLayerEffect: ReturnType<typeof createVoyageClientEffect> | undefined
let issueProjectionRepositoryLayerEffect: ReturnType<typeof createWeaviateClientEffect> | undefined

interface IssueDiscoveryAIShape {
  generate<T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError>
  embed(input: EmbedInput): Effect.Effect<EmbedResult, AIError>
  rerank(input: RerankInput): Effect.Effect<readonly RerankResult[], AIError>
}

export const getPostgresClient = (): PostgresClient => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }
  return postgresClientInstance
}

export const getClickhouseClient = (): ClickHouseClient => {
  if (!clickhouseClientInstance) {
    clickhouseClientInstance = createClickhouseClient()
  }
  return clickhouseClientInstance
}

const getRedisClient = (): RedisClient => {
  if (!redisInstance) {
    redisInstance = createRedisClient(createRedisConnection())
  }
  return redisInstance
}

const getAiServiceFromLayer = <E>(layer: Layer.Layer<AI, E, never>) =>
  Effect.gen(function* () {
    return yield* AI
  }).pipe(Effect.provide(layer)) as Effect.Effect<IssueDiscoveryAIShape, E, never>

export const getIssueDiscoveryAiLayerEffect = (): Effect.Effect<
  Layer.Layer<AI, never, never>,
  CreateVoyageClientError,
  never
> => {
  if (!issueDiscoveryAiLayerEffect) {
    issueDiscoveryAiLayerEffect = createVoyageClientEffect()
  }

  return issueDiscoveryAiLayerEffect.pipe(
    Effect.flatMap((voyageClient) => {
      const cacheLayer = RedisCacheStoreLive(getRedisClient())
      const generateLayer = AIGenerateLive.pipe(Layer.provideMerge(AICredentialsLive), Layer.provideMerge(cacheLayer))
      const voyageLayer = AIVoyageLive(voyageClient).pipe(Layer.provideMerge(cacheLayer))

      return Effect.all({
        generateAi: getAiServiceFromLayer(generateLayer),
        voyageAi: getAiServiceFromLayer(voyageLayer),
      }).pipe(
        Effect.map(({ generateAi, voyageAi }) =>
          Layer.succeed(AI, {
            generate: generateAi.generate,
            embed: voyageAi.embed,
            rerank: voyageAi.rerank,
          }),
        ),
      )
    }),
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
