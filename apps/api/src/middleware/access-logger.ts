import { createMiddleware } from "hono/factory"
import { logger } from "hono/logger"

type AccessLog = {
  info: (message: string) => void
  warn: (message: string) => void
}

const createAccessLogWriter = (log: AccessLog, isHealth: boolean, isOk: () => boolean) => {
  let incoming: string | undefined

  return (message: string) => {
    if (incoming === undefined) {
      incoming = message
      if (!isHealth) {
        log.info(message)
      }
      return
    }

    const ok = isOk()
    if (isHealth && ok) {
      return
    }

    const write = ok ? log.info : log.warn
    if (isHealth && incoming) {
      write(incoming)
    }
    write(message)
  }
}

export const accessLogger = (log: AccessLog) => {
  return createMiddleware(async (c, next) => {
    const isHealth = c.req.method === "GET" && c.req.path === "/health"
    await logger(createAccessLogWriter(log, isHealth, () => c.res.ok))(c, next)
  })
}
