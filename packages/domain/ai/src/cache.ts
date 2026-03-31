import { hash } from "@repo/utils"
import { Effect, ServiceMap } from "effect"
import type {
  AICredentialError,
  AIError,
  EmbedInput,
  EmbedResult,
  GenerateInput,
  GenerateResult,
  RerankInput,
  RerankResult,
} from "./index.ts"

export class AICache extends ServiceMap.Service<
  AICache,
  {
    get(key: string): Effect.Effect<string | null, AIError>
    set(key: string, value: string): Effect.Effect<void, AIError>
  }
>()("@domain/ai/AICache") {}

const cacheKey = (namespace: string, input: unknown): string => `ai:${namespace}:${hash(input)}`

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
  cache: {
    get(key: string): Effect.Effect<string | null, AIError>
    set(key: string, value: string): Effect.Effect<void, AIError>
  },
) => ({
  generate: <T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError> =>
    Effect.gen(function* () {
      const { schema: _, ...hashable } = input
      const key = cacheKey("generate", hashable)

      const cached = yield* cache.get(key)
      if (cached !== null) {
        return JSON.parse(cached) as GenerateResult<T>
      }

      const result = yield* ai.generate(input)
      yield* cache.set(key, JSON.stringify(result))
      return result
    }),

  embed: (input: EmbedInput) =>
    Effect.gen(function* () {
      const key = cacheKey("embed", input)

      const cached = yield* cache.get(key)
      if (cached !== null) {
        return JSON.parse(cached) as EmbedResult
      }

      const result = yield* ai.embed(input)
      yield* cache.set(key, JSON.stringify(result))
      return result
    }),

  rerank: (input: RerankInput) =>
    Effect.gen(function* () {
      const key = cacheKey("rerank", input)

      const cached = yield* cache.get(key)
      if (cached !== null) {
        return JSON.parse(cached) as readonly RerankResult[]
      }

      const result = yield* ai.rerank(input)
      yield* cache.set(key, JSON.stringify(result))
      return result
    }),
})
