import type { CacheStoreShape } from "@domain/shared"
import { hash } from "@repo/utils"
import { Effect, Schema } from "effect"
import {
  type AICredentialError,
  AIError,
  type EmbedInput,
  type EmbedResult,
  type GenerateInput,
  type GenerateResult,
  type RerankInput,
  type RerankResult,
} from "./index.ts"

const cacheKey = (namespace: string, input: unknown): string => `ai:${namespace}:${hash(input)}`
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

/**
 * Applies cache-aside behavior to an existing `AI` implementation.
 *
 * Given the same inputs to `generate`, `embed`, or `rerank`, this wrapper
 * checks the cache first. On a miss it delegates to the underlying AI
 * implementation, serializes the result, and stores it before returning.
 *
 * `generate` is keyed on every field except `schema` (Zod objects are not
 * serializable). Two calls that differ only in schema shape but share the
 * same prompt/model/settings will share a cache entry — callers that need
 * schema-level isolation should add a discriminator via `providerOptions`.
 */
export const withAICache = (
  ai: {
    generate<T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError>
    embed(input: EmbedInput): Effect.Effect<EmbedResult, AIError>
    rerank(input: RerankInput): Effect.Effect<readonly RerankResult[], AIError>
  },
  cache: CacheStoreShape,
) => ({
  generate: <T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError> =>
    Effect.gen(function* () {
      const { schema: _, ...hashable } = input
      const key = cacheKey("generate", hashable)

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
    }),

  embed: (input: EmbedInput) =>
    Effect.gen(function* () {
      const key = cacheKey("embed", input)

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
    }),

  rerank: (input: RerankInput) =>
    Effect.gen(function* () {
      const key = cacheKey("rerank", input)

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
    }),
})
