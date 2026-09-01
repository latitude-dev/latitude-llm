import { createMiddleware } from "hono/factory"
import { logger } from "hono/logger"

type AccessLog = {
  info: (message: string) => void
  warn: (message: string) => void
}

export const accessLogger = (log: AccessLog) => {
  return createMiddleware(async (c, next) => {
    const isHealth = c.req.method === "GET" && c.req.path === "/health"
    let incoming: string | undefined

    await logger((message) => {
      if (incoming === undefined) {
        incoming = message
        if (!isHealth) {
          log.info(message)
        }
        return
      }

      if (isHealth && c.res.ok) {
        return
      }

      const write = c.res.ok ? log.info : log.warn
      if (isHealth && incoming) {
        write(incoming)
      }
      write(message)
    })(c, next)
  })
}
