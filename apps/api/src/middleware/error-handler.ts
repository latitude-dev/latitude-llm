import { parseEnv } from "@platform/env"
import { isHttpError, LatitudeObservabilityTestError, toHttpResponse } from "@repo/utils"
import { Effect } from "effect"
import type { Context, ErrorHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import { logger } from "../utils/logger.ts"

/**
 * Advertises where to find this resource server's OAuth metadata, per RFC 9728
 * §5.1. MCP clients read the AS location out of this header to start the
 * authorization flow; without it a spec-following client can't tell an
 * OAuth-protected resource from plain bad credentials. Built from `LAT_API_URL`
 * so the URL matches the `resource` identifier the metadata document itself
 * advertises (see `routes/well-known.ts`).
 */
const setBearerChallenge = (c: Context) => {
  const apiUrl = Effect.runSync(parseEnv("LAT_API_URL", "string", "http://localhost:3001"))
  c.header("WWW-Authenticate", `Bearer resource_metadata="${apiUrl}/.well-known/oauth-protected-resource"`)
}

/**
 * Global error handler for Hono.
 *
 * Catches all errors from routes and converts them to user-friendly
 * HTTP responses based on the error type.
 */
export const honoErrorHandler: ErrorHandler = (err, c) => {
  if (err instanceof LatitudeObservabilityTestError) {
    return c.json({ name: err.name, message: err.message, service: err.service }, 500)
  }

  // If it's a domain HTTP-aware error, use its status and message.
  if (isHttpError(err)) {
    const { status, body } = toHttpResponse(err)
    if (status === 401) setBearerChallenge(c)
    return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 500)
  }

  // Hono's own 4xx exceptions — most commonly thrown by the zod-openapi
  // validator on malformed JSON, malformed FormData, missing headers, etc.
  // Surface them with the status Hono chose instead of swallowing them
  // into the generic 500 branch below.
  if (err instanceof HTTPException) {
    if (err.status === 401) setBearerChallenge(c)
    return c.json({ name: err.name, message: err.message }, err.status)
  }

  // Log unexpected errors for debugging
  logger.error(err)

  // Return a generic 500 for unknown errors
  return c.json({ error: "Internal server error" }, 500)
}
