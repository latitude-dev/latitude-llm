import { API_KEY_TOKEN_PREFIX } from "@domain/api-keys"
import { OrganizationId, UnauthorizedError, UserId } from "@domain/shared"
import { validateApiKey } from "@platform/api-key-auth"
import type { PostgresClient } from "@platform/db-postgres"
import { type OAuthTokenAuthResult, validateOAuthAccessToken } from "@platform/oauth-token-auth"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"
import { getAdminPostgresClient } from "../clients.ts"
import type { AuthContext } from "../types.ts"
import { createTouchBuffer } from "./touch-buffer.ts"

/**
 * Token prefix for OAuth access tokens. Set by the Better Auth `mcp` plugin's
 * `databaseHooks.oauthAccessToken.create.before` hook on the web app. Mirrors
 * the `lak_` prefix on API keys: cheap routing, no double lookups, accurate
 * error messages.
 */
const OAUTH_TOKEN_PREFIX = "loa_"

const extractBearerToken = (c: Context): string | undefined => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return undefined
  }

  return authHeader.slice(7)
}

interface AuthMiddlewareOptions {
  adminClient: PostgresClient | undefined
  logTouchBuffer: boolean
}

const apiKeyContext = (result: { keyId: string; organizationId: string }): AuthContext => ({
  method: "api-key",
  userId: UserId(`api-key:${result.keyId}`),
  organizationId: OrganizationId(result.organizationId),
})

const oauthContext = (result: OAuthTokenAuthResult): AuthContext => ({
  method: "oauth",
  userId: UserId(result.userId),
  organizationId: OrganizationId(result.organizationId),
  oauthClientId: result.oauthClientId,
  scopes: result.scopes,
  expiresAt: result.expiresAt,
})

const authenticateWithApiKey = (
  redis: Context["var"]["redis"],
  token: string,
  options: AuthMiddlewareOptions,
): Effect.Effect<AuthContext | null, never> => {
  const adminClient = options.adminClient ?? getAdminPostgresClient()
  const touchBuffer = createTouchBuffer(adminClient, {
    logTouchBuffer: options.logTouchBuffer,
  })

  return Effect.gen(function* () {
    const result = yield* validateApiKey(token, {
      redis,
      adminClient,
      onKeyValidated: (keyId) => touchBuffer.touch(keyId),
    })
    return result ? apiKeyContext(result) : null
  }).pipe(Effect.orDie)
}

const authenticateWithOAuth = (
  redis: Context["var"]["redis"],
  token: string,
  options: AuthMiddlewareOptions,
): Effect.Effect<AuthContext | null, never> => {
  const adminClient = options.adminClient ?? getAdminPostgresClient()

  return Effect.gen(function* () {
    const result = yield* validateOAuthAccessToken(token, { redis, adminClient })
    return result ? oauthContext(result) : null
  }).pipe(Effect.orDie)
}

/**
 * Routes a bearer token to its validator using the prefix:
 *
 * - `lak_…` → API-key path only.
 * - `loa_…` → OAuth path only.
 * - anything else → legacy fallback (try API-key first, then OAuth). Existing
 *   un-prefixed UUID API keys land here. We try API-key first because that's
 *   what the legacy population is; the OAuth attempt is a defensive second
 *   pass so a future stray un-prefixed OAuth-style token doesn't silently 401.
 *
 * Each branch performs at most one Redis + DB round-trip. The legacy branch
 * does at most two (one per validator); both validators have a negative-cache
 * TTL so a non-existent token only hits the DB once across both attempts.
 */
const authenticate = (c: Context, options: AuthMiddlewareOptions): Effect.Effect<AuthContext, UnauthorizedError> =>
  Effect.gen(function* () {
    const bearerToken = extractBearerToken(c)
    if (!bearerToken) {
      return yield* new UnauthorizedError({ message: "Authentication required" })
    }

    const redis = c.get("redis")

    if (bearerToken.startsWith(API_KEY_TOKEN_PREFIX)) {
      const ctx = yield* authenticateWithApiKey(redis, bearerToken, options)
      if (ctx) return ctx
      return yield* new UnauthorizedError({ message: "Invalid API key" })
    }

    if (bearerToken.startsWith(OAUTH_TOKEN_PREFIX)) {
      const ctx = yield* authenticateWithOAuth(redis, bearerToken, options)
      if (ctx) return ctx
      return yield* new UnauthorizedError({ message: "Invalid OAuth access token" })
    }

    // Legacy un-prefixed token (pre-prefix-rollout API keys). Try API-key first
    // since that's what the legacy population is.
    const apiKeyCtx = yield* authenticateWithApiKey(redis, bearerToken, options)
    if (apiKeyCtx) return apiKeyCtx

    const oauthCtx = yield* authenticateWithOAuth(redis, bearerToken, options)
    if (oauthCtx) return oauthCtx

    return yield* new UnauthorizedError({ message: "Invalid credentials" })
  })

/**
 * Create authentication middleware.
 *
 * Validates `Authorization: Bearer …` tokens. Routes by token prefix to the
 * API-key validator (`lak_…`), the OAuth validator (`loa_…`), or both
 * (legacy un-prefixed). Public routes should be excluded from this middleware.
 */
export const createAuthMiddleware = (options: AuthMiddlewareOptions): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const authContext = await Effect.runPromise(authenticate(c, options).pipe(withTracing))
    c.set("auth", authContext)
    await next()
  }
}
