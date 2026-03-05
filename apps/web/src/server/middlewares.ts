import { isHttpError } from "@domain/shared"
import { createLogger } from "@repo/observability"
import { createMiddleware } from "@tanstack/react-start"

const logger = createLogger("server-fn")

export const errorHandler = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    if (isHttpError(error)) {
      const plainError = new Error(error.httpMessage)
      plainError.name = error._tag
      if (error instanceof Error && error.stack) {
        plainError.stack = error.stack
      }
      logger.error(`[${error._tag}] ${error.httpMessage}`)
      throw plainError
    }
    const message = error instanceof Error ? error.message : "Internal server error"
    logger.error(message)
    throw error
  }
})
