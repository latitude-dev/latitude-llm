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

const extractBearerToken = (c: Context): string | undefined => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return undefined
  }

  return authHeader.slice(7)
}

type AuthMethod = AuthContext["method"]

interface AuthMiddlewareOptions {
  adminClient: PostgresClient | undefined
  logTouchBuffer: boolean
  /** Validators to try, in order. Defaults to `["api-key", "oauth"]`. */
  allowedMethods?: ReadonlyArray<AuthMethod>
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

const DEFAULT_ALLOWED_METHODS: ReadonlyArray<AuthMethod> = ["api-key", "oauth"]

/**
 * Authenticates a bearer token by trying the allowed validators in sequence,
 * then 401. Both validators have a short negative-cache TTL, so an unknown
 * bearer hits each underlying DB at most once per cache window.
 *
 * No prefix-based dispatch — bearer tokens are opaque random strings, and
 * matching against the wrong validator just returns null cheaply. The trade-off
 * is one extra Redis + DB round-trip on the OAuth happy path when both methods
 * are allowed; the user knows their throughput envelope and the simplicity wins.
 */
const authenticate = (c: Context, options: AuthMiddlewareOptions): Effect.Effect<AuthContext, UnauthorizedError> =>
  Effect.gen(function* () {
    const bearerToken = extractBearerToken(c)
    if (!bearerToken) {
      return yield* new UnauthorizedError({ message: "Authentication required" })
    }

    const redis = c.get("redis")
    const allowedMethods = options.allowedMethods ?? DEFAULT_ALLOWED_METHODS

    for (const method of allowedMethods) {
      const authContext =
        method === "api-key"
          ? yield* authenticateWithApiKey(redis, bearerToken, options)
          : yield* authenticateWithOAuth(redis, bearerToken, options)
      if (authContext) return authContext
    }

    return yield* new UnauthorizedError({ message: "Invalid credentials" })
  })

/**
 * Create authentication middleware.
 *
 * Validates `Authorization: Bearer …` tokens against the configured stores
 * (`allowedMethods`, defaulting to API-key then OAuth). Public routes should
 * be excluded from this middleware.
 */
export const createAuthMiddleware = (options: AuthMiddlewareOptions): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const authContext = await Effect.runPromise(authenticate(c, options).pipe(withTracing))
    c.set("auth", authContext)
    await next()
  }
}
