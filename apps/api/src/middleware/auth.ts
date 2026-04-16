import { OrganizationId, UnauthorizedError, UserId } from "@domain/shared"
import { validateApiKey } from "@platform/api-key-auth"
import type { PostgresClient } from "@platform/db-postgres"
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

const authenticate = (c: Context, options: AuthMiddlewareOptions): Effect.Effect<AuthContext, UnauthorizedError> => {
  return Effect.gen(function* () {
    const bearerToken = extractBearerToken(c)

    if (!bearerToken) {
      return yield* new UnauthorizedError({
        message: "Authentication required",
      })
    }

    const authContext = yield* authenticateWithApiKey(c.get("redis"), bearerToken, options)
    if (authContext) return authContext

    return yield* new UnauthorizedError({
      message: "Invalid API key",
    })
  })
}

/**
 * Create authentication middleware.
 *
 * Validates API keys sent via the Authorization: Bearer header.
 * Public routes should be excluded from this middleware.
 */
interface AuthMiddlewareOptions {
  adminClient: PostgresClient | undefined
  logTouchBuffer: boolean
}

export const createAuthMiddleware = (options: AuthMiddlewareOptions): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const authContext = await Effect.runPromise(authenticate(c, options).pipe(withTracing))
    c.set("auth", authContext)
    await next()
  }
}
