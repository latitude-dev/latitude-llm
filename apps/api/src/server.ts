import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { serve } from "@hono/node-server"
import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"
import { parseEnv } from "@platform/env"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import type { Hono } from "hono"
import { logger as honoLogger } from "hono/logger"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "./clients.ts"
import { registerCorsMiddleware } from "./middleware/cors.ts"
import { honoErrorHandler } from "./middleware/error-handler.ts"
import { destroyTouchBuffer } from "./middleware/touch-buffer.ts"
import { registerRoutes } from "./routes/index.ts"
import { logger } from "./utils/logger.ts"

const nodeEnv = process.env.NODE_ENV || "development"
// Only load .env file if import.meta.url is available (not in CJS bundles)
if (import.meta.url) {
  const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))
  if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true })
}

const app = new OpenAPIHono()
const port = Effect.runSync(parseEnv("LAT_API_PORT", "number", 3001))

// Register global error handler
app.use(
  honoLogger((message: string, ...rest: string[]) => {
    console.log(message, ...rest)
  }),
)
app.onError(honoErrorHandler)

// OpenAPIHono extends Hono — the cast is safe
registerCorsMiddleware(app as unknown as Hono, { nodeEnv })

registerRoutes({
  app,
  database: getPostgresClient(),
  clickhouse: getClickhouseClient(),
  redis: getRedisClient(),
})

// Register security scheme via the OpenAPI registry
app.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "http",
  scheme: "bearer",
  description: "Organization-scoped API key",
})

// OpenAPI spec
app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Latitude API",
    version: "1.0.0",
    description: "The Latitude public API. Authenticate using an API key via the `Authorization: Bearer` header.",
  },
  servers: [{ url: `http://localhost:${port}`, description: "Local development" }],
})

// Swagger UI
app.get("/docs", swaggerUI({ url: "/openapi.json" }))

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
    logger.info(`OpenAPI spec: http://localhost:${info.port}/openapi.json`)
    logger.info(`Swagger UI:   http://localhost:${info.port}/docs`)
  },
)
