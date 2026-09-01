import { createMiddleware } from "hono/factory"
import { logger } from "hono/logger"

type AccessLog = {
  info: (message: string) => void
  warn: (message: string) => void
}

export const accessLogger = (log: AccessLog) => {
  return createMiddleware(async (c, next) => {
    const isHealth = c.req.method === "GET" && c.req.path === "/health"
    const messages: string[] = []
    await logger((message) => messages.push(message))(c, next)

    if (isHealth && c.res.ok) {
      return
    }

    const write = c.res.ok ? log.info : log.warn
    for (const message of messages) {
      write(message)
    }
  })
}
