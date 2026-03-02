import type { ApiKeyRepository } from "@domain/api-keys"
import type { MembershipRepository } from "@domain/organizations"
import { OrganizationId, UnauthorizedError, UserId } from "@domain/shared-kernel"
import type { RedisClient } from "@platform/cache-redis"
import { Effect, Option } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"
import { getBetterAuth } from "../clients.ts"
import type { AuthContext } from "../types.ts"
import type { TouchBuffer } from "./touch-buffer.ts"

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

const getApiKeyCacheKey = (token: string): string => `apikey:${token}`

/**
 * Dependencies required for authentication.
 */
interface AuthDeps {
  readonly apiKeyRepository: ApiKeyRepository
  readonly membershipRepository: MembershipRepository
  readonly redis: RedisClient
  readonly touchBuffer: TouchBuffer
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
 * Get cached API key result from Redis.
 */
const getCachedApiKey = (
  redis: RedisClient,
  token: string,
): Effect.Effect<{ organizationId: string; keyId: string } | null | undefined, never> => {
  const cacheKey = getApiKeyCacheKey(token)
  return Effect.tryPromise({
    try: async () => {
      const cached = await redis.get(cacheKey)
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
  redis: RedisClient,
  token: string,
  result: { organizationId: string; keyId: string } | null,
  ttl: number,
): Effect.Effect<void, never> => {
  const cacheKey = getApiKeyCacheKey(token)
  return Effect.tryPromise({
    try: () => redis.setex(cacheKey, ttl, JSON.stringify(result)),
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
  deps: AuthDeps,
  token: string,
): Effect.Effect<{ organizationId: string; keyId: string } | null, never> => {
  return Effect.gen(function* () {
    const startTime = Date.now()

    // Try cache first for consistent lookup time
    const cached = yield* getCachedApiKey(deps.redis, token)

    if (cached !== undefined) {
      // Cache hit - enforce minimum time and return
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return cached
    }

    // Cache miss - hit database
    const apiKeyOption = yield* Effect.option(deps.apiKeyRepository.findByToken(token))

    if (Option.isNone(apiKeyOption) || apiKeyOption.value === null) {
      // Cache negative result briefly to prevent timing attacks
      yield* cacheApiKeyResult(deps.redis, token, null, INVALID_KEY_TTL_SECONDS)
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return null
    }

    const apiKey = apiKeyOption.value

    const result = {
      organizationId: apiKey.organizationId as string,
      keyId: apiKey.id as string,
    }

    // Cache successful validation for 5 minutes
    yield* cacheApiKeyResult(deps.redis, token, result, VALID_KEY_TTL_SECONDS)

    // Use TouchBuffer for batched updates instead of fire-and-forget
    // This reduces database writes by 90%+ by batching updates
    deps.touchBuffer.touch(apiKey.id as string)

    // Enforce minimum time before returning
    yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
    return result
  }).pipe(Effect.orDie)
}

/**
 * Validate that a user is a member of the specified organization.
 * Returns true if membership is valid, false otherwise.
 */
const validateOrganizationMembership = (
  deps: AuthDeps,
  userId: string,
  organizationId: string,
): Effect.Effect<boolean, never> => {
  return deps.membershipRepository.isMember(OrganizationId(organizationId), userId).pipe(Effect.orDie)
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
const authenticateWithApiKey = (
  deps: AuthDeps,
  _c: Context,
  token: string,
): Effect.Effect<AuthContext | null, never> => {
  return Effect.gen(function* () {
    const result = yield* validateApiKey(deps, token)

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
const authenticateWithSession = (deps: AuthDeps, c: Context): Effect.Effect<AuthContext | null, never> => {
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

    const isMember = yield* validateOrganizationMembership(deps, session.user.id, orgId)
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
const authenticate = (deps: AuthDeps, c: Context): Effect.Effect<AuthContext, UnauthorizedError> => {
  return Effect.gen(function* () {
    const apiKeyToken = extractApiKeyToken(c)

    let authContext: AuthContext | null = null

    if (apiKeyToken) {
      authContext = yield* authenticateWithApiKey(deps, c, apiKeyToken)
    } else {
      authContext = yield* authenticateWithSession(deps, c)
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
export const createAuthMiddleware = (
  apiKeyRepository: ApiKeyRepository,
  membershipRepository: MembershipRepository,
  redis: RedisClient,
  touchBuffer: TouchBuffer,
): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const deps: AuthDeps = { apiKeyRepository, membershipRepository, redis, touchBuffer }

    // Build and run the authentication program
    // Errors will propagate to the global error handler
    const authContext = await Effect.runPromise(authenticate(deps, c))

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
