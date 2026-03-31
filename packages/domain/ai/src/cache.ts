import type { CacheStoreShape } from "@domain/shared"
import { hash } from "@repo/utils"
import { Effect } from "effect"
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
        return JSON.parse(cached) as GenerateResult<T>
      }

      const result = yield* ai.generate(input)
      yield* cache
        .set(key, JSON.stringify(result), { ttlSeconds: DEFAULT_AI_CACHE_TTL_SECONDS })
        .pipe(Effect.mapError(toAIError("write")))
      return result
    }),

  embed: (input: EmbedInput) =>
    Effect.gen(function* () {
      const key = cacheKey("embed", input)

      const cached = yield* cache.get(key).pipe(Effect.mapError(toAIError("read")))
      if (cached !== null) {
        return JSON.parse(cached) as EmbedResult
      }

      const result = yield* ai.embed(input)
      yield* cache
        .set(key, JSON.stringify(result), { ttlSeconds: DEFAULT_AI_CACHE_TTL_SECONDS })
        .pipe(Effect.mapError(toAIError("write")))
      return result
    }),

  rerank: (input: RerankInput) =>
    Effect.gen(function* () {
      const key = cacheKey("rerank", input)

      const cached = yield* cache.get(key).pipe(Effect.mapError(toAIError("read")))
      if (cached !== null) {
        return JSON.parse(cached) as readonly RerankResult[]
      }

      const result = yield* ai.rerank(input)
      yield* cache
        .set(key, JSON.stringify(result), { ttlSeconds: DEFAULT_AI_CACHE_TTL_SECONDS })
        .pipe(Effect.mapError(toAIError("write")))
      return result
    }),
})
