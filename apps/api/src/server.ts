import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { serve } from "@hono/node-server"
import { parseEnv } from "@platform/env"
import { createLogger } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { Hono } from "hono"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "./clients.ts"
import { registerCorsMiddleware } from "./middleware/cors.ts"
import { honoErrorHandler } from "./middleware/error-handler.ts"
import { destroyTouchBuffer } from "./middleware/touch-buffer.ts"
import { registerRoutes } from "./routes/index.ts"

const nodeEnv = process.env.NODE_ENV || "development"
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true })

const app = new Hono()
const port = Effect.runSync(parseEnv("LAT_API_PORT", "number", 3001))
const logger = createLogger("api")

// Register global error handler
app.onError(honoErrorHandler)

registerCorsMiddleware(app, { nodeEnv, logger })

registerRoutes({
  app,
  database: getPostgresClient(),
  clickhouse: getClickhouseClient(),
  redis: getRedisClient(),
})

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
