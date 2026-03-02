import { OrganizationId, UnauthorizedError, UserId } from "@domain/shared-kernel"
import { createApiKeyPostgresRepository, createMembershipPostgresRepository } from "@platform/db-postgres"
import { Effect, Option } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"
import { getBetterAuth, getRedisClient } from "../clients.ts"
import { getDbDependencies } from "../db-deps.ts"
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

const getApiKeyCacheKey = (token: string): string => `apikey:${token}`

/**
 * Get cached API key result from Redis.
 */
const getCachedApiKey = (
  token: string,
): Effect.Effect<{ organizationId: string; keyId: string } | null | undefined, never> => {
  const redis = getRedisClient()
  const cacheKey = getApiKeyCacheKey(token)
  return Effect.tryPromise({
    try: async () => {
      const cached = await withTimeout(redis.get(cacheKey), null)
      if (!cached) return undefined
      const parsed = JSON.parse(cached)
      return parsed as { organizationId: string; keyId: string } | null
    },
    catch: () => undefined,
  }).pipe(Effect.orDie)
}

/**
 * Cache API key result in Redis.
 */
const cacheApiKeyResult = (
  token: string,
  result: { organizationId: string; keyId: string } | null,
  ttl: number,
): Effect.Effect<void, never> => {
  const redis = getRedisClient()
  const cacheKey = getApiKeyCacheKey(token)
  return Effect.tryPromise({
    try: () => withTimeout(redis.setex(cacheKey, ttl, JSON.stringify(result)), undefined),
    catch: () => undefined,
  }).pipe(Effect.orDie)
}

/**
 * Validate API key with Redis caching and constant-time execution.
 *
 * Security features:
 * - All code paths take at least MIN_VALIDATION_TIME_MS (~50ms) to prevent timing attacks
 * - Redis cache provides consistent lookup time for both valid and invalid keys
 * - Invalid keys are cached briefly to prevent repeated DB hits and timing enumeration
 * - Graceful degradation: continues without cache if Redis unavailable
 */
const validateApiKey = (
  c: Context,
  token: string,
): Effect.Effect<{ organizationId: string; keyId: string } | null, never> => {
  const dependencies = getDbDependencies(c)
  const apiKeyRepository = createApiKeyPostgresRepository(dependencies.db)
  const touchBuffer = createTouchBuffer(dependencies)

  return Effect.gen(function* () {
    const startTime = Date.now()

    // Try cache first for consistent lookup time
    const cached = yield* getCachedApiKey(token)

    if (cached !== undefined) {
      // Cache hit - enforce minimum time and return
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return cached
    }

    // Cache miss - hit database
    const apiKeyOption = yield* Effect.option(apiKeyRepository.findByToken(token))

    if (Option.isNone(apiKeyOption) || apiKeyOption.value === null) {
      // Cache negative result briefly to prevent timing attacks
      yield* cacheApiKeyResult(token, null, INVALID_KEY_TTL_SECONDS)
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return null
    }

    const apiKey = apiKeyOption.value

    const result = {
      organizationId: apiKey.organizationId as string,
      keyId: apiKey.id as string,
    }

    // Cache successful validation for 5 minutes
    yield* cacheApiKeyResult(token, result, VALID_KEY_TTL_SECONDS)

    // Use TouchBuffer for batched updates instead of fire-and-forget
    // This reduces database writes by 90%+ by batching updates
    touchBuffer.touch(apiKey.id as string)

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
  const dependencies = getDbDependencies(c)
  const membershipRepository = createMembershipPostgresRepository(dependencies.db)
  return membershipRepository.isMember(OrganizationId(organizationId), userId).pipe(Effect.orDie)
}

/**
 * Extract API key token from request headers.
 */
const extractApiKeyToken = (c: Context): string | undefined => {
  const apiKeyHeader = c.req.header("X-API-Key")
  if (apiKeyHeader) {
    return apiKeyHeader
  }

  const authHeader = c.req.header("Authorization")
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7)
  }

  return undefined
}

/**
 * Authenticate via API key.
 */
const authenticateWithApiKey = (c: Context, token: string): Effect.Effect<AuthContext | null, never> => {
  return Effect.gen(function* () {
    const result = yield* validateApiKey(c, token)

    if (result) {
      return {
        userId: UserId(`api-key:${result.keyId}`),
        organizationId: OrganizationId(result.organizationId),
        method: "api-key" as const,
      }
    }

    return null
  }).pipe(Effect.orDie)
}

/**
 * Authenticate via Better Auth session (cookie or JWT).
 */
const authenticateWithSession = (c: Context): Effect.Effect<AuthContext | null, never> => {
  return Effect.gen(function* () {
    const auth = getBetterAuth()

    const session = yield* Effect.tryPromise({
      try: () => auth.api.getSession({ headers: c.req.raw.headers }),
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

    return {
      userId: UserId(session.user.id),
      organizationId: OrganizationId(orgId),
      method: "cookie" as const,
    }
  }).pipe(Effect.orDie)
}

/**
 * Main authentication effect that tries all authentication methods.
 */
const authenticate = (c: Context): Effect.Effect<AuthContext, UnauthorizedError> => {
  return Effect.gen(function* () {
    const apiKeyToken = extractApiKeyToken(c)

    let authContext: AuthContext | null = null

    if (apiKeyToken) {
      authContext = yield* authenticateWithApiKey(c, apiKeyToken)
    } else {
      authContext = yield* authenticateWithSession(c)
    }

    if (!authContext) {
      return yield* new UnauthorizedError({ message: "Authentication required" })
    }

    return authContext
  })
}

/**
 * Create authentication middleware.
 *
 * This middleware validates requests using one of three methods:
 * 1. Cookie-based session (Better Auth)
 * 2. JWT Bearer token (Better Auth)
 * 3. API Key
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

/**
 * Helper to get auth context from Hono context.
 *
 * This helper provides runtime safety by throwing if auth context is not set.
 * Only use this in routes protected by the auth middleware.
 *
 * Usage in route handlers:
 * ```typescript
 * const auth = getAuthContext(c)
 * console.log(auth.userId, auth.organizationId)
 * ```
 *
 * @throws {UnauthorizedError} If auth context is not found (middleware not applied)
 */
export const getAuthContext = (c: Context): AuthContext => {
  const auth = c.get("auth")
  if (!auth) {
    throw new UnauthorizedError({
      message: "Auth context not found - ensure auth middleware is applied to this route",
    })
  }
  return auth
}
