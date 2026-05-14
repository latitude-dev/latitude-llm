import { ApiKeyCacheInvalidator, ApiKeyRepository } from "@domain/api-keys"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresClient } from "@platform/db-postgres"
import { ApiKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { hash } from "@repo/utils"
import { Effect, Layer, Option } from "effect"

/**
 * Minimum time for API key validation in milliseconds.
 * Ensures consistent timing to reduce timing-attack surface.
 */
export const MIN_VALIDATION_TIME_MS = 50

const VALID_KEY_TTL_SECONDS = 300
const INVALID_KEY_TTL_SECONDS = 5
const REDIS_OPERATION_TIMEOUT_MS = 50

const withTimeout = <T>(operation: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([
    operation,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), REDIS_OPERATION_TIMEOUT_MS)),
  ])

const getApiKeyCacheKey = (tokenHash: string): string => `apikey:${tokenHash}`

/**
 * Best-effort `DEL apikey:${tokenHash}` so a freshly-revoked key stops
 * validating on cache hits before its TTL would have expired. Used by
 * revoke server-fns / routes — the DB row is already updated; this just
 * keeps the Redis side from serving the stale positive validation.
 *
 * Silently swallows Redis errors: the DB is the source of truth, so even
 * a missed invalidation degrades to the usual 5-minute stale window
 * rather than throwing the revoke call on the floor.
 */
export const invalidateApiKeyCache = (redis: RedisClient, tokenHash: string): Promise<void> =>
  withTimeout(
    redis.del(getApiKeyCacheKey(tokenHash)).then(
      () => undefined,
      () => undefined,
    ),
    undefined,
  )

/**
 * Live implementation of {@link ApiKeyCacheInvalidator}. Wraps
 * {@link invalidateApiKeyCache} in the Effect shape the use-case yields.
 * Closure captures the Redis client so callers wire it once, the same way
 * they wire `RedisCacheStoreLive(redis)`.
 */
export const ApiKeyCacheInvalidatorLive = (redis: RedisClient) =>
  Layer.succeed(ApiKeyCacheInvalidator, {
    delete: (tokenHash: string) =>
      Effect.tryPromise({
        try: () => invalidateApiKeyCache(redis, tokenHash),
        catch: () => undefined,
      }).pipe(Effect.orDie),
  })

export type ApiKeyAuthResult = { organizationId: string; keyId: string }

const isCachedApiKeyResult = (value: unknown): value is ApiKeyAuthResult | null => {
  if (value === null) {
    return true
  }

  if (typeof value !== "object" || value === null) {
    return false
  }

  if (!("organizationId" in value) || !("keyId" in value)) {
    return false
  }

  return typeof value.organizationId === "string" && typeof value.keyId === "string"
}

const getCachedApiKey = (
  redis: RedisClient,
  tokenHash: string,
): Effect.Effect<ApiKeyAuthResult | null | undefined, never> => {
  const cacheKey = getApiKeyCacheKey(tokenHash)
  return Effect.tryPromise({
    try: async () => {
      const cached = await withTimeout(redis.get(cacheKey), null)
      if (!cached) return undefined
      const parsed = JSON.parse(cached)
      return isCachedApiKeyResult(parsed) ? parsed : undefined
    },
    catch: () => undefined,
  }).pipe(Effect.orDie)
}

const cacheApiKeyResult = (
  redis: RedisClient,
  tokenHash: string,
  result: ApiKeyAuthResult | null,
  ttl: number,
): Effect.Effect<void, never> => {
  const cacheKey = getApiKeyCacheKey(tokenHash)
  return Effect.tryPromise({
    try: () => withTimeout(redis.setex(cacheKey, ttl, JSON.stringify(result)), undefined),
    catch: () => undefined,
  }).pipe(Effect.orDie)
}

const enforceMinimumTime = (startTime: number, minMs: number): Effect.Effect<void, never> => {
  const elapsed = Date.now() - startTime
  if (elapsed < minMs) {
    return Effect.tryPromise({
      try: () => new Promise<void>((resolve) => setTimeout(resolve, minMs - elapsed)),
      catch: () => undefined,
    }).pipe(Effect.orDie)
  }
  return Effect.void
}

export interface ValidateApiKeyDeps {
  readonly redis: RedisClient
  readonly adminClient: PostgresClient
  /** Called when a key is validated via DB (not cache-only path). */
  readonly onKeyValidated?: (keyId: string) => void
}

/**
 * Validate bearer token: hash, Redis cache, optional DB lookup, minimum timing.
 * Shared by `apps/api` and `apps/ingest` so auth behavior cannot drift.
 */
export const validateApiKey = (
  token: string,
  deps: ValidateApiKeyDeps,
): Effect.Effect<ApiKeyAuthResult | null, never> => {
  const { redis, adminClient, onKeyValidated } = deps

  return Effect.gen(function* () {
    const startTime = Date.now()
    const tokenHash = yield* hash(token)

    const cached = yield* getCachedApiKey(redis, tokenHash)

    if (cached !== undefined) {
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return cached
    }

    const apiKeyRepository = yield* ApiKeyRepository
    const apiKeyOption = yield* Effect.option(apiKeyRepository.findByTokenHash(tokenHash))

    if (Option.isNone(apiKeyOption)) {
      yield* cacheApiKeyResult(redis, tokenHash, null, INVALID_KEY_TTL_SECONDS)
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return null
    }

    const apiKey = apiKeyOption.value

    const result: ApiKeyAuthResult = {
      organizationId: apiKey.organizationId,
      keyId: apiKey.id,
    }

    yield* cacheApiKeyResult(redis, tokenHash, result, VALID_KEY_TTL_SECONDS)
    onKeyValidated?.(apiKey.id)
    yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
    return result
  }).pipe(withPostgres(ApiKeyRepositoryLive, adminClient), Effect.orDie)
}
