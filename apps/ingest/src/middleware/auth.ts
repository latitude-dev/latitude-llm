import { validateApiKey } from "@platform/api-key-auth"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Exit } from "effect"
import type { MiddlewareHandler } from "hono"
import { getAdminPostgresClient, getRedisClient } from "../clients.ts"
import type { IngestEnv } from "../types.ts"
import { createTouchBuffer } from "./touch-buffer.ts"

const logger = createLogger("ingest-auth")

export const authMiddleware: MiddlewareHandler<IngestEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization header with Bearer token is required" }, 401)
  }

  const token = authHeader.slice(7)
  const adminClient = getAdminPostgresClient()
  const touchBuffer = createTouchBuffer(adminClient)

  const exit = await Effect.runPromiseExit(
    validateApiKey(token, {
      redis: getRedisClient(),
      adminClient,
      onKeyValidated: (keyId) => touchBuffer.touch(keyId),
    }).pipe(withTracing),
  )

  // The key could not be checked (Postgres or Redis unreachable), which says nothing about the key.
  // OTLP exporters drop a batch on 401 but retry it on 503.
  if (Exit.isFailure(exit)) {
    logger.error("API key validation unavailable", exit.cause)
    return c.json({ error: "Authentication is temporarily unavailable. Please retry later." }, 503, {
      "Retry-After": "1",
    })
  }

  const result = exit.value
  if (!result) {
    return c.json({ error: "Invalid API key" }, 401)
  }

  c.set("organizationId", result.organizationId)
  c.set("apiKeyId", result.keyId)
  c.set("isSandbox", result.isSandbox)
  c.set("scopedProjectId", result.projectId)
  await next()
}
