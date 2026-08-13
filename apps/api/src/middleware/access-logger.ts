import { createMiddleware } from "hono/factory"
import { logger } from "hono/logger"

type AccessLog = (message: string) => void

export const accessLogger = (log: AccessLog) => {
  const logRequest = logger(log)

  return createMiddleware(async (c, next) => {
    if (c.req.method !== "GET" || c.req.path !== "/health") {
      return logRequest(c, next)
    }

    const messages: string[] = []
    await logger((message) => messages.push(message))(c, next)

    if (!c.res.ok) {
      messages.forEach(log)
    }
  })
}
