import { AI, AIEmbed, AIError, AIGenerate, AIRerank, type AIShape } from "@domain/ai"
import { CacheStore, type CacheStoreShape, RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import { Effect, Layer } from "effect"
import { withAICache } from "./cache.ts"

type AIServiceShape = AIShape

const missingMethodError = (method: "generate" | "embed" | "rerank") =>
  new AIError({
    message: `withAi requires a ${method} adapter before that AI capability can be used`,
  })

const missingMethodService: AIServiceShape = {
  generate: () => Effect.fail(missingMethodError("generate")),
  embed: () => Effect.fail(missingMethodError("embed")),
  rerank: () => Effect.fail(missingMethodError("rerank")),
}

const missingGenerateLayer = Layer.succeed(AIGenerate, {
  generate: missingMethodService.generate,
})

const missingEmbedLayer = Layer.succeed(AIEmbed, {
  embed: missingMethodService.embed,
})

const missingRerankLayer = Layer.succeed(AIRerank, {
  rerank: missingMethodService.rerank,
})

const getCacheStore = (redisClient: RedisClient) =>
  Effect.gen(function* () {
    return yield* CacheStore
  }).pipe(Effect.provide(RedisCacheStoreLive(redisClient))) as Effect.Effect<CacheStoreShape, never, never>

const assembledAiLayer = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
  Layer.effect(
    AI,
    Effect.gen(function* () {
      const generate = yield* AIGenerate
      const embed = yield* AIEmbed
      const rerank = yield* AIRerank

      return {
        generate: generate.generate,
        embed: embed.embed,
        rerank: rerank.rerank,
      } satisfies AIServiceShape
    }),
  ).pipe(Layer.provideMerge(Layer.mergeAll(missingGenerateLayer, missingEmbedLayer, missingRerankLayer, layer)))

export const createAiLayer = <A, E, R>(
  layer: Layer.Layer<A, E, R>,
  redisClient?: RedisClient,
): Layer.Layer<AI, E, R> => {
  const aiLayer = assembledAiLayer(layer)

  if (!redisClient) {
    return aiLayer
  }

  return Layer.effect(
    AI,
    Effect.gen(function* () {
      const ai = yield* AI
      const cacheStore = yield* getCacheStore(redisClient)
      return withAICache(ai, cacheStore)
    }),
  ).pipe(Layer.provideMerge(aiLayer))
}

export const withAi = <A, E, R>(layer: Layer.Layer<A, E, R>, redisClient?: RedisClient) =>
  Effect.provide(createAiLayer(layer, redisClient))
