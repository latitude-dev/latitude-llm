import { parseEnvOptional } from "@platform/env"
import type { createLogger } from "@repo/observability"
import { Effect } from "effect"
import type { Hono } from "hono"
import { cors } from "hono/cors"

interface RegisterCorsMiddlewareOptions {
  readonly nodeEnv: string
  readonly logger: ReturnType<typeof createLogger>
}

const parseAllowedOrigins = (nodeEnv: string, logger: ReturnType<typeof createLogger>): string[] => {
  const originsEnv = Effect.runSync(parseEnvOptional(process.env.LAT_CORS_ALLOWED_ORIGINS, "string"))

  if (originsEnv) {
    return originsEnv
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
  }

  if (nodeEnv === "development") {
    return ["http://localhost:3000"]
  }

  logger.warn("CORS_ALLOWED_ORIGINS not set, using empty whitelist (will reject all browser requests)")
  return []
}

export const registerCorsMiddleware = (app: Hono, options: RegisterCorsMiddlewareOptions): void => {
  const allowedOrigins = parseAllowedOrigins(options.nodeEnv, options.logger)

  app.use(
    cors({
      origin: (origin, c) => {
        if (!origin) return "*"

        if (allowedOrigins.includes(origin)) {
          return origin
        }

        options.logger.warn(`CORS rejected origin: ${origin} for path: ${c.req.path}`)
        return null
      },
      allowMethods: ["GET", "POST", "PUT", "DELETE"],
      allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
      credentials: true,
      maxAge: 86400,
      exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
    }),
  )
}
