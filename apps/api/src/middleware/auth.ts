import { OrganizationId, UnauthorizedError, UserId } from "@domain/shared"
import { createMembershipPostgresRepository, createUnscopedApiKeyPostgresRepository } from "@platform/db-postgres"
import { hashToken } from "@repo/utils"
import { Effect, Option } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"
import { getBetterAuth } from "../clients.ts"
import type { AuthContext } from "../types.ts"
import { createTouchBuffer } from "./touch-buffer.ts"

/**
 * Minimum time for API key validation in milliseconds.
 * This ensures all code paths take consistent time to prevent timing attacks.
 */
const MIN_VALIDATION_TIME_MS = 50

/**
 * Cache TTL constants
 */
const VALID_KEY_TTL_SECONDS = 300 // 5 minutes for valid keys
const INVALID_KEY_TTL_SECONDS = 5 // 5 seconds for invalid keys (prevents timing attacks)
const REDIS_OPERATION_TIMEOUT_MS = 50

const withTimeout = <T>(operation: Promise<T>, fallback: T): Promise<T> => {
  return Promise.race([
    operation,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), REDIS_OPERATION_TIMEOUT_MS)),
  ])
}

const getApiKeyCacheKey = (tokenHash: string): string => `apikey:${tokenHash}`

const isCachedApiKeyResult = (value: unknown): value is { organizationId: string; keyId: string } | null => {
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

/**
 * Get cached API key result from Redis (keyed by token hash).
 */
const getCachedApiKey = (
  redis: Context["var"]["redis"],
  tokenHash: string,
): Effect.Effect<{ organizationId: string; keyId: string } | null | undefined, never> => {
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

/**
 * Cache API key result in Redis (keyed by token hash).
 */
const cacheApiKeyResult = (
  redis: Context["var"]["redis"],
  tokenHash: string,
  result: { organizationId: string; keyId: string } | null,
  ttl: number,
): Effect.Effect<void, never> => {
  const cacheKey = getApiKeyCacheKey(tokenHash)
  return Effect.tryPromise({
    try: () => withTimeout(redis.setex(cacheKey, ttl, JSON.stringify(result)), undefined),
    catch: () => undefined,
  }).pipe(Effect.orDie)
}

/**
 * Validate API key with Redis caching and constant-time execution.
 *
 * Security features:
 * - Incoming token is hashed (SHA-256) before any lookup — raw tokens never touch cache or DB queries
 * - All code paths take at least MIN_VALIDATION_TIME_MS (~50ms) to prevent timing attacks
 * - Redis cache provides consistent lookup time for both valid and invalid keys
 * - Invalid keys are cached briefly to prevent repeated DB hits and timing enumeration
 * - Graceful degradation: continues without cache if Redis unavailable
 */
const validateApiKey = (
  c: Context,
  token: string,
): Effect.Effect<{ organizationId: string; keyId: string } | null, never> => {
  const db = c.get("db")
  const redis = c.get("redis")
  // Use unscoped repository for cross-org authentication lookup
  const unscopedApiKeyRepository = createUnscopedApiKeyPostgresRepository(db)
  const touchBuffer = createTouchBuffer(db)

  return Effect.gen(function* () {
    const startTime = Date.now()
    const tokenHash = hashToken(token)

    // Try cache first for consistent lookup time (keyed by hash)
    const cached = yield* getCachedApiKey(redis, tokenHash)

    if (cached !== undefined) {
      // Cache hit - enforce minimum time and return
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return cached
    }

    // Cache miss - hit database (lookup by token hash using unscoped repo)
    const apiKeyOption = yield* Effect.option(unscopedApiKeyRepository.findByTokenHash(tokenHash))

    if (Option.isNone(apiKeyOption) || apiKeyOption.value === null) {
      // Cache negative result briefly to prevent timing attacks
      yield* cacheApiKeyResult(redis, tokenHash, null, INVALID_KEY_TTL_SECONDS)
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return null
    }

    const apiKey = apiKeyOption.value

    const result = {
      organizationId: apiKey.organizationId,
      keyId: apiKey.id,
    }

    // Cache successful validation for 5 minutes (keyed by hash)
    yield* cacheApiKeyResult(redis, tokenHash, result, VALID_KEY_TTL_SECONDS)

    // Use TouchBuffer for batched updates instead of fire-and-forget
    // This reduces database writes by 90%+ by batching updates
    touchBuffer.touch(apiKey.id)

    // Enforce minimum time before returning
    yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
    return result
  }).pipe(Effect.orDie)
}

/**
 * Enforce minimum processing time to prevent timing attacks.
 * Calculates elapsed time and delays if necessary to reach minimum threshold.
 */
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

/**
 * Validate that a user is a member of the specified organization.
 * Returns true if membership is valid, false otherwise.
 */
const validateOrganizationMembership = (
  c: Context,
  userId: string,
  organizationId: string,
): Effect.Effect<boolean, never> => {
  const membershipRepository = createMembershipPostgresRepository(c.get("db"))
  return membershipRepository.isMember(OrganizationId(organizationId), userId).pipe(Effect.orDie)
}

/**
 * Extract API key token from request headers.
 */
const extractApiKeyToken = (c: Context): string | undefined => {
  const apiKeyHeader = c.req.header("X-API-Key")
  return apiKeyHeader || undefined
}

const extractBearerToken = (c: Context): string | undefined => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return undefined
  }

  return authHeader.slice(7)
}

/**
 * Authenticate via API key.
 */
const authenticateWithApiKey = (c: Context, token: string): Effect.Effect<AuthContext | null, never> => {
  return Effect.gen(function* () {
    const result = yield* validateApiKey(c, token)

    if (result) {
      const authContext: AuthContext = {
        userId: UserId(`api-key:${result.keyId}`),
        organizationId: OrganizationId(result.organizationId),
        method: "api-key",
      }

      return authContext
    }

    return null
  }).pipe(Effect.orDie)
}

/**
 * Authenticate via JWT bearer token.
 */
const authenticateWithJwt = (c: Context, token: string): Effect.Effect<AuthContext | null, never> => {
  return Effect.gen(function* () {
    const auth = getBetterAuth()
    const headers = new Headers(c.req.raw.headers)
    headers.set("authorization", `Bearer ${token}`)

    const session = yield* Effect.tryPromise({
      try: () => auth.api.getSession({ headers }),
      catch: () => null,
    }).pipe(Effect.orDie)

    if (!session?.user) {
      return null
    }

    const orgId = c.req.param("organizationId")
    if (!orgId) {
      return null
    }

    const isMember = yield* validateOrganizationMembership(c, session.user.id, orgId)
    if (!isMember) {
      return null
    }

    const authContext: AuthContext = {
      userId: UserId(session.user.id),
      organizationId: OrganizationId(orgId),
      method: "jwt",
    }

    return authContext
  }).pipe(Effect.orDie)
}

/**
 * Main authentication effect that tries all authentication methods.
 */
const authenticate = (c: Context): Effect.Effect<AuthContext, UnauthorizedError> => {
  return Effect.gen(function* () {
    const apiKeyToken = extractApiKeyToken(c)
    const bearerToken = extractBearerToken(c)

    let authContext: AuthContext | null = null

    if (apiKeyToken) {
      authContext = yield* authenticateWithApiKey(c, apiKeyToken)
    } else if (bearerToken) {
      authContext = yield* authenticateWithJwt(c, bearerToken)
    }

    if (!authContext) {
      return yield* new UnauthorizedError({
        message: "Authentication required",
      })
    }

    return authContext
  })
}

/**
 * Create authentication middleware.
 *
 * This middleware validates requests using one of two methods:
 * 1. JWT Bearer token (Better Auth)
 * 2. API Key
 *
 * The middleware sets auth context on the Hono context for downstream handlers.
 * Public routes should be excluded from this middleware.
 */
export const createAuthMiddleware = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    // Build and run the authentication program
    // Errors will propagate to the global error handler
    const authContext = await Effect.runPromise(authenticate(c))

    // Set auth context on Hono context - type-safe via module augmentation
    c.set("auth", authContext)

    await next()
  }
}
