import { validateApiKey } from "@platform/api-key-auth"
import { Effect } from "effect"
import type { MiddlewareHandler } from "hono"
import { getAdminPostgresClient, getRedisClient } from "../clients.ts"
import type { IngestEnv } from "../types.ts"

export const authMiddleware: MiddlewareHandler<IngestEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization header with Bearer token is required" }, 401)
  }

  const token = authHeader.slice(7)
  const result = await Effect.runPromise(
    validateApiKey(token, {
      redis: getRedisClient(),
      adminClient: getAdminPostgresClient(),
    }),
  )

  if (!result) {
    return c.json({ error: "Invalid API key" }, 401)
  }

  c.set("organizationId", result.organizationId)
  c.set("apiKeyId", result.keyId)
  await next()
}
