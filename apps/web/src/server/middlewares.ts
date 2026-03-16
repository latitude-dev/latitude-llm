import type { DomainError } from "@domain/shared"
import { createLogger } from "@repo/observability"
import { isHttpError } from "@repo/utils"
import { createMiddleware } from "@tanstack/react-start"

const logger = createLogger("server-fn")

/**
 * Server function error middleware.
 *
 * TanStack Start's ShallowErrorPlugin only serializes `error.message` across
 * the server→client boundary — `error.name` and all other properties are
 * stripped. To let the client identify domain errors we JSON-encode `_tag`,
 * `message`, and `status` into `error.message`. Use `parseServerError` on the
 * client to decode them.
 */
export const errorHandler = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next()
  } catch (e) {
    const httpError = isHttpError(e)
    const tag =
      typeof e === "object" && e !== null && "_tag" in (e as DomainError) ? (e as DomainError)._tag : undefined
    const message = httpError ? e.httpMessage : e instanceof Error ? e.message : "Unknown error occurred"
    const status = httpError ? e.httpStatus : 500

    const payload = JSON.stringify({ _tag: tag, message, status })
    const error = new Error(payload)

    if (e instanceof Error && e.stack) error.stack = e.stack

    logger.error({ _tag: tag, message, status })

    throw error
  }
})

/**
 * Structured error returned by `parseServerError`.
 */
interface ServerError {
  readonly _tag: string | undefined
  readonly message: string
  readonly status: number
}

/**
 * Parse an error thrown by a server function on the client.
 *
 * Returns `{ _tag, message, status }` when the error was produced by
 * `errorHandler`, otherwise falls back to the raw error message with no tag.
 */
export function parseServerError(err: unknown): ServerError {
  const raw = err instanceof Error ? err.message : String(err)
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      return {
        _tag: parsed._tag,
        message: parsed.message,
        status: typeof parsed.status === "number" ? parsed.status : 500,
      }
    }
  } catch {
    // not JSON — fall through
  }
  return { _tag: undefined, message: raw, status: 500 }
}

/**
 * Extract a user-friendly error message from a server function error.
 *
 * Use this in UI catch blocks where you just need the message string
 * (e.g. for toast notifications or inline error displays).
 */
export function toUserMessage(err: unknown): string {
  return parseServerError(err).message
}
