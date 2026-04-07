import {
  type AICredentialError,
  AIError,
  type AIShape,
  type EmbedInput,
  type EmbedResult,
  type GenerateInput,
  type GenerateResult,
  type RerankInput,
  type RerankResult,
} from "@domain/ai"
import type { CacheStoreShape } from "@platform/cache-redis"
import { type CryptoError, hash } from "@repo/utils"
import { Effect, Schema } from "effect"

const DEFAULT_AI_CACHE_TTL_SECONDS = 24 * 60 * 60

const generateResultSchema = Schema.Struct({
  object: Schema.Unknown,
  tokens: Schema.Number,
  duration: Schema.Number,
})
const embedResultSchema = Schema.Struct({
  embedding: Schema.Array(Schema.Number),
})
const rerankResultSchema = Schema.Array(
  Schema.Struct({
    index: Schema.Number,
    relevanceScore: Schema.Number,
  }),
)
const generateResultFromJsonStringSchema = Schema.fromJsonString(generateResultSchema)
const embedResultFromJsonStringSchema = Schema.fromJsonString(embedResultSchema)
const rerankResultFromJsonStringSchema = Schema.fromJsonString(rerankResultSchema)

const toAIError =
  (operation: string) =>
  (cause: unknown): AIError =>
    new AIError({
      message: `AI cache ${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    })

const cacheKey = (namespace: string, input: unknown): Effect.Effect<string, AIError> =>
  hash({ namespace, input }).pipe(
    Effect.map((hashValue) => `ai:${namespace}:${hashValue}`),
    Effect.mapError(
      (cause: CryptoError) =>
        new AIError({
          message: `AI cache key failed (${cause.operation}): ${
            cause.cause instanceof Error ? cause.cause.message : String(cause.cause)
          }`,
          cause,
        }),
    ),
  )

export const withAiCache = (ai: AIShape, cache: CacheStoreShape): AIShape => ({
  generate: <T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError> =>
    Effect.gen(function* () {
      const { schema: _, ...hashable } = input
      const key = yield* cacheKey("generate", hashable)

      const cached = yield* cache.get(key).pipe(Effect.mapError(toAIError("read")))
      if (cached !== null) {
        return yield* Effect.try({
          try: () => Schema.decodeUnknownSync(generateResultFromJsonStringSchema)(cached) as GenerateResult<T>,
          catch: toAIError("read"),
        })
      }

      const result = yield* ai.generate(input)
      const encoded = yield* Effect.try({
        try: () => Schema.encodeSync(generateResultFromJsonStringSchema)(result as GenerateResult<unknown>),
        catch: toAIError("write"),
      })
      yield* cache
        .set(key, encoded, { ttlSeconds: DEFAULT_AI_CACHE_TTL_SECONDS })
        .pipe(Effect.mapError(toAIError("write")))
      return result
    }) as Effect.Effect<GenerateResult<T>, AIError | AICredentialError, never>,

  embed: (input: EmbedInput): Effect.Effect<EmbedResult, AIError> =>
    Effect.gen(function* () {
      const key = yield* cacheKey("embed", input)

      const cached = yield* cache.get(key).pipe(Effect.mapError(toAIError("read")))
      if (cached !== null) {
        const decoded = yield* Effect.try({
          try: () => Schema.decodeUnknownSync(embedResultFromJsonStringSchema)(cached),
          catch: toAIError("read"),
        })
        return { embedding: [...decoded.embedding] } satisfies EmbedResult
      }

      const result = yield* ai.embed(input)
      const encoded = yield* Effect.try({
        try: () => Schema.encodeSync(embedResultFromJsonStringSchema)(result),
        catch: toAIError("write"),
      })
      yield* cache
        .set(key, encoded, { ttlSeconds: DEFAULT_AI_CACHE_TTL_SECONDS })
        .pipe(Effect.mapError(toAIError("write")))
      return result
    }) as Effect.Effect<EmbedResult, AIError, never>,

  rerank: (input: RerankInput): Effect.Effect<readonly RerankResult[], AIError> =>
    Effect.gen(function* () {
      const key = yield* cacheKey("rerank", input)

      const cached = yield* cache.get(key).pipe(Effect.mapError(toAIError("read")))
      if (cached !== null) {
        return yield* Effect.try({
          try: () => Schema.decodeUnknownSync(rerankResultFromJsonStringSchema)(cached),
          catch: toAIError("read"),
        })
      }

      const result = yield* ai.rerank(input)
      const encoded = yield* Effect.try({
        try: () => Schema.encodeSync(rerankResultFromJsonStringSchema)(result),
        catch: toAIError("write"),
      })
      yield* cache
        .set(key, encoded, { ttlSeconds: DEFAULT_AI_CACHE_TTL_SECONDS })
        .pipe(Effect.mapError(toAIError("write")))
      return result
    }) as Effect.Effect<readonly RerankResult[], AIError, never>,
})
