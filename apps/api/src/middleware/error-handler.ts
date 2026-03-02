import type { ErrorHandler } from "hono"
import { isHttpError, toHttpResponse } from "../errors.ts"

/**
 * Global error handler for Hono.
 *
 * Catches all errors from routes and converts them to user-friendly
 * HTTP responses based on the error type.
 */
export const honoErrorHandler: ErrorHandler = (err, c) => {
  // If it's an HTTP-aware error, use its status and message
  if (isHttpError(err)) {
    const { status, body } = toHttpResponse(err)
    return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 500)
  }

  // Log unexpected errors for debugging
  console.error("Unexpected error:", err)

  // Return a generic 500 for unknown errors
  return c.json({ error: "Internal server error" }, 500)
}
