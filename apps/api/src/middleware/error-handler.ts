import { isHttpError, LatitudeObservabilityTestError, toHttpResponse } from "@repo/utils"
import type { ErrorHandler } from "hono"
import { logger } from "../utils/logger.ts"

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

  // If it's an HTTP-aware error, use its status and message
  if (isHttpError(err)) {
    const { status, body } = toHttpResponse(err)
    return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 500)
  }

  // Log unexpected errors for debugging
  logger.error(err)

  // Return a generic 500 for unknown errors
  return c.json({ error: "Internal server error" }, 500)
}
