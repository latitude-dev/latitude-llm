import { OrganizationId, type RepositoryError, UnauthorizedError, UserId } from "@domain/shared"
import { validateApiKey } from "@platform/api-key-auth"
import { parseEnv } from "@platform/env"
import type { PostgresClient } from "@platform/db-postgres"
import { type OAuthTokenAuthResult, validateOAuthAccessToken } from "@platform/oauth-token-auth"
import { withTracing } from "@repo/observability"
import { isHttpError, toHttpResponse } from "@repo/utils"
import { Cause, Effect, Exit, Option } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"
import { getAdminPostgresClient } from "../clients.ts"
import type { AuthContext } from "../types.ts"
import { logger } from "../utils/logger.ts"
import { createTouchBuffer } from "./touch-buffer.ts"

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

const apiKeyContext = (result: { keyId: string; organizationId: string; projectId: string | null }): AuthContext => ({
  method: "api-key",
  userId: UserId(`api-key:${result.keyId}`),
  organizationId: OrganizationId(result.organizationId),
  projectId: result.projectId,
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
) => {
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
  })
}

const authenticateWithOAuth = (
  redis: Context["var"]["redis"],
  token: string,
  options: AuthMiddlewareOptions,
) => {
  const adminClient = options.adminClient ?? getAdminPostgresClient()

  return Effect.gen(function* () {
    const result = yield* validateOAuthAccessToken(token, { redis, adminClient })
    return result ? oauthContext(result) : null
  })
}

/**
 * Authenticates a bearer token by trying both validators in sequence: API key
 * first, then OAuth, then 401. Both validators have a short negative-cache TTL,
 * so an unknown bearer hits each underlying DB at most once per cache window.
 *
 * No prefix-based dispatch — bearer tokens are opaque random strings, and
 * matching against the wrong validator just returns null cheaply. The trade-off
 * is one extra Redis + DB round-trip on the OAuth happy path; the user knows
 * their throughput envelope and the simplicity wins.
 */
const authenticate = (
  c: Context,
  options: AuthMiddlewareOptions,
): Effect.Effect<AuthContext, UnauthorizedError | RepositoryError> =>
  Effect.gen(function* () {
    const bearerToken = extractBearerToken(c)
    if (!bearerToken) {
      return yield* new UnauthorizedError({ message: "Authentication required" })
    }

    const redis = c.get("redis")

    const apiKeyCtx = yield* authenticateWithApiKey(redis, bearerToken, options)
    if (apiKeyCtx) return apiKeyCtx

    const oauthCtx = yield* authenticateWithOAuth(redis, bearerToken, options)
    if (oauthCtx) return oauthCtx

    return yield* new UnauthorizedError({ message: "Invalid credentials" })
  })

/**
 * Create authentication middleware.
 *
 * Validates `Authorization: Bearer …` tokens against both the API-key store
 * and the OAuth access-token store, in that order. Public routes should be
 * excluded from this middleware.
 */
const setBearerChallenge = (c: Context) => {
  const apiUrl = Effect.runSync(parseEnv("LAT_API_URL", "string", "http://localhost:3001"))
  c.header("WWW-Authenticate", `Bearer resource_metadata="${apiUrl}/.well-known/oauth-protected-resource"`)
}

export const createAuthMiddleware = (options: AuthMiddlewareOptions): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const exit = await Effect.runPromiseExit(authenticate(c, options).pipe(withTracing))

    if (Exit.isFailure(exit)) {
      const authError = Cause.findErrorOption(exit.cause)
      if (Option.isSome(authError) && isHttpError(authError.value) && authError.value.httpStatus === 401) {
        const { status, body } = toHttpResponse(authError.value)
        setBearerChallenge(c)
        return c.json(body, status as 401)
      }

      logger.error("Authentication unavailable", exit.cause)
      return c.json({ error: "Authentication is temporarily unavailable. Please retry later." }, 503, {
        "Retry-After": "1",
      })
    }

    c.set("auth", exit.value)
    await next()
  }
}
