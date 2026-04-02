import { serve } from "@hono/node-server"
import { httpInstrumentationMiddleware as otel } from "@hono/otel"
import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"
import { parseEnv } from "@platform/env"
import { initializeObservability, shutdownObservability } from "@repo/observability"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import type { Hono } from "hono"
import { logger as honoLogger } from "hono/logger"
import { getClickhouseClient, getPostgresClient, getQueuePublisher, getRedisClient } from "./clients.ts"
import { registerCorsMiddleware } from "./middleware/cors.ts"
import { honoErrorHandler } from "./middleware/error-handler.ts"
import { destroyTouchBuffer } from "./middleware/touch-buffer.ts"
import { registerRoutes } from "./routes/index.ts"
import type { AppEnv } from "./types.ts"
import { logger } from "./utils/logger.ts"

const { nodeEnv } = loadDevelopmentEnvironments(import.meta.url)
const startServer = async () => {
  await initializeObservability({
    serviceName: "api",
  })

  const app = new OpenAPIHono<AppEnv>()
  const port = Effect.runSync(parseEnv("LAT_API_PORT", "number", 3001))

  app.use(
    honoLogger((message: string, ...rest: string[]) => {
      logger.info(message, ...rest)
    }),
  )

  // Add Hono OpenTelemetry middleware
  app.use(otel())

  app.onError(honoErrorHandler)

  registerCorsMiddleware(app as unknown as Hono, { nodeEnv })

  const queuePublisher = await getQueuePublisher()

  registerRoutes(app, {
    database: getPostgresClient(),
    clickhouse: getClickhouseClient(),
    redis: getRedisClient(),
    queuePublisher,
    logTouchBuffer: true,
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

    await shutdownObservability()
    logger.info("Graceful shutdown complete")
    process.exit(0)
  }

  // Register shutdown handlers
  process.on("SIGTERM", () => void handleShutdown("SIGTERM"))
  process.on("SIGINT", () => void handleShutdown("SIGINT"))

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
}

void startServer().catch((error) => {
  logger.error("Failed to start API server", error)
  process.exit(1)
})
