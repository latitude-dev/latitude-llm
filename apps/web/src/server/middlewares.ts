import type { DomainError } from "@domain/shared"
import { createLogger } from "@repo/observability"
import { createMiddleware } from "@tanstack/react-start"

const logger = createLogger("server-fn")

/**
 * Server function error middleware.
 *
 * TanStack Start's ShallowErrorPlugin only serializes `error.message` across
 * the server→client boundary — `error.name` and all other properties are
 * stripped. To let the client identify domain errors we JSON-encode `_tag`
 * and `httpMessage` into `error.message`. Use `parseServerError` on the
 * client to decode them.
 */
export const errorHandler = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next()
  } catch (e) {
    const isDomainError = typeof e === "object" && e !== null && "httpMessage" in (e as DomainError)
    const tag =
      typeof e === "object" && e !== null && "_tag" in (e as DomainError) ? (e as DomainError)._tag : undefined
    const message = isDomainError
      ? (e as DomainError).httpMessage
      : e instanceof Error
        ? e.message
        : "Unknown error occurred"

    const payload = JSON.stringify({ _tag: tag, message })
    const error = new Error(payload)

    if (e instanceof Error && e.stack) error.stack = e.stack

    logger.error({ _tag: tag, message })

    throw error
  }
})

/**
 * Parse an error thrown by a server function on the client.
 *
 * Returns `{ _tag, message }` when the error was produced by `errorHandler`,
 * otherwise falls back to the raw error message with no tag.
 */
export function parseServerError(err: unknown): { _tag: string | undefined; message: string } {
  const raw = err instanceof Error ? err.message : String(err)
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      return { _tag: parsed._tag, message: parsed.message }
    }
  } catch {
    // not JSON — fall through
  }
  return { _tag: undefined, message: raw }
}
