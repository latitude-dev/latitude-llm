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
 * `message`, and `status` into `error.message`. Use `parseServerError` from
 * `lib/errors.ts` on the client to decode them.
 */
export const errorHandler = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const startedAt = Date.now()

  try {
    const result = await next()
    logger.info({
      message: "server function succeeded",
      durationMs: Date.now() - startedAt,
    })
    return result
  } catch (e) {
    const durationMs = Date.now() - startedAt
    const httpError = isHttpError(e)
    const tag =
      typeof e === "object" && e !== null && "_tag" in (e as DomainError) ? (e as DomainError)._tag : undefined
    const message = httpError ? e.httpMessage : e instanceof Error ? e.message : "Unknown error occurred"
    const status = httpError ? e.httpStatus : 500

    const payload = JSON.stringify({ _tag: tag, message, status })
    const error = new Error(payload)

    if (e instanceof Error && e.stack) error.stack = e.stack

    logger.error({ _tag: tag, message, status, durationMs })

    throw error
  }
})
