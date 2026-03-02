import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { serve } from "@hono/node-server"
import { parseEnv } from "@platform/env"
import { createLogger } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { honoErrorHandler } from "./middleware/error-handler.ts"
import { destroyTouchBuffer } from "./middleware/touch-buffer.ts"
import { registerRoutes } from "./routes/index.ts"

const nodeEnv = process.env.NODE_ENV || "development"
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath })

const app = new Hono()
const port = Effect.runSync(parseEnv(process.env.PORT, "number", 3001))
const logger = createLogger("api")

// Register global error handler
app.onError(honoErrorHandler)

// Enable CORS for web frontend with strict whitelist
const allowedOrigins = [
  "https://app.latitude.com",
  "https://admin.latitude.com",
  nodeEnv === "development" ? "http://localhost:3000" : null,
].filter((origin): origin is string => origin !== null)

app.use(
  cors({
    origin: (origin, c) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return "*"

      // Strict whitelist check
      if (allowedOrigins.includes(origin)) {
        return origin
      }

      // Log suspicious origin attempts for security monitoring
      logger.warn(`CORS rejected origin: ${origin} for path: ${c.req.path}`)
      return null // Reject
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
    maxAge: 86400, // Cache preflight for 24 hours
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
  }),
)

registerRoutes({ app })

// Graceful shutdown handler
const handleShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`)

  // Flush pending touch buffer updates
  try {
    await destroyTouchBuffer()
    logger.info("Touch buffer flushed successfully")
  } catch (error) {
    logger.error(`Failed to flush touch buffer: ${error instanceof Error ? error.message : "Unknown error"}`)
  }

  logger.info("Graceful shutdown complete")
  process.exit(0)
}

// Register shutdown handlers
process.on("SIGTERM", () => handleShutdown("SIGTERM"))
process.on("SIGINT", () => handleShutdown("SIGINT"))

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info(`api listening on http://localhost:${info.port}`)
  },
)
