import { ApiKeyRepository } from "@domain/api-keys"
import { ApiKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { hash } from "@repo/utils"
import { Effect, Option } from "effect"
import type { MiddlewareHandler } from "hono"
import { getAdminPostgresClient, getRedisClient } from "../clients.ts"
import type { IngestEnv } from "../types.ts"

const MIN_VALIDATION_TIME_MS = 50
const VALID_KEY_TTL_SECONDS = 300
const INVALID_KEY_TTL_SECONDS = 5
const REDIS_OPERATION_TIMEOUT_MS = 50

const withTimeout = <T>(operation: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([
    operation,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), REDIS_OPERATION_TIMEOUT_MS)),
  ])

const getApiKeyCacheKey = (tokenHash: string): string => `apikey:${tokenHash}`

type ApiKeyResult = { organizationId: string; keyId: string }

const isCachedResult = (value: unknown): value is ApiKeyResult | null => {
  if (value === null) return true
  return (
    typeof value === "object" &&
    value !== null &&
    "organizationId" in value &&
    "keyId" in value &&
    typeof value.organizationId === "string" &&
    typeof value.keyId === "string"
  )
}

const getCachedApiKey = (tokenHash: string): Effect.Effect<ApiKeyResult | null | undefined> => {
  const redis = getRedisClient()
  const cacheKey = getApiKeyCacheKey(tokenHash)
  return Effect.tryPromise({
    try: async () => {
      const cached = await withTimeout(redis.get(cacheKey), null)
      if (!cached) return undefined
      const parsed = JSON.parse(cached)
      return isCachedResult(parsed) ? parsed : undefined
    },
    catch: () => undefined,
  }).pipe(Effect.orDie)
}

const cacheApiKeyResult = (tokenHash: string, result: ApiKeyResult | null, ttl: number): Effect.Effect<void> => {
  const redis = getRedisClient()
  const cacheKey = getApiKeyCacheKey(tokenHash)
  return Effect.tryPromise({
    try: () => withTimeout(redis.setex(cacheKey, ttl, JSON.stringify(result)), undefined),
    catch: () => undefined,
  }).pipe(Effect.orDie)
}

const enforceMinimumTime = (startTime: number, minMs: number): Effect.Effect<void> => {
  const elapsed = Date.now() - startTime
  if (elapsed < minMs) {
    return Effect.tryPromise({
      try: () => new Promise<void>((resolve) => setTimeout(resolve, minMs - elapsed)),
      catch: () => undefined,
    }).pipe(Effect.orDie)
  }
  return Effect.void
}

const validateApiKey = (token: string) => {
  const client = getAdminPostgresClient()

  return Effect.gen(function* () {
    const startTime = Date.now()
    const tokenHash = yield* hash(token)

    const cached = yield* getCachedApiKey(tokenHash)
    if (cached !== undefined) {
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return cached
    }

    const repo = yield* ApiKeyRepository
    const apiKeyOption = yield* Effect.option(repo.findByTokenHash(tokenHash))

    if (Option.isNone(apiKeyOption)) {
      yield* cacheApiKeyResult(tokenHash, null, INVALID_KEY_TTL_SECONDS)
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return null
    }

    const apiKey = apiKeyOption.value
    const result: ApiKeyResult = { organizationId: apiKey.organizationId, keyId: apiKey.id }

    yield* cacheApiKeyResult(tokenHash, result, VALID_KEY_TTL_SECONDS)
    yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
    return result
  }).pipe(withPostgres(ApiKeyRepositoryLive, client), Effect.orDie)
}

export const authMiddleware: MiddlewareHandler<IngestEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization header with Bearer token is required" }, 401)
  }

  const token = authHeader.slice(7)
  const result = await Effect.runPromise(validateApiKey(token))

  if (!result) {
    return c.json({ error: "Invalid API key" }, 401)
  }

  c.set("organizationId", result.organizationId)
  c.set("apiKeyId", result.keyId)
  await next()
}
