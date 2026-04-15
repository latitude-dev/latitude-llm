import { serve } from "@hono/node-server"
import { httpInstrumentationMiddleware as otel } from "@hono/otel"
import { parseEnv } from "@platform/env"
import { createLogger, initializeObservability, shutdownObservability } from "@repo/observability"
import { isHttpError, LatitudeObservabilityTestError, toHttpResponse } from "@repo/utils"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { Hono } from "hono"
import { getQueuePublisher } from "./clients.ts"
import { destroyTouchBuffer } from "./middleware/touch-buffer.ts"
import { registerRoutes } from "./routes/index.ts"
import type { IngestEnv } from "./types.ts"

loadDevelopmentEnvironments(import.meta.url)

const start = async () => {
  await initializeObservability({
    serviceName: "ingest",
  })

  const app = new Hono<IngestEnv>()
  const port = Effect.runSync(parseEnv("LAT_INGEST_PORT", "number", 3002))
  const logger = createLogger("ingest")

  // Add Hono OpenTelemetry middleware
  app.use(otel())

  app.onError((err, c) => {
    if (err instanceof LatitudeObservabilityTestError) {
      return c.json({ name: err.name, message: err.message, service: err.service }, 500)
    }

    if (isHttpError(err)) {
      const { status, body } = toHttpResponse(err)
      return c.json(body, status as 400 | 401 | 403 | 404 | 500)
    }

    logger.error(err)
    return c.json({ error: "Internal server error" }, 500)
  })

  registerRoutes({ app })

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      logger.info(`ingest listening on http://localhost:${info.port}`)
    },
  )

  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down ingest...`)
    server.close()

    try {
      await destroyTouchBuffer()
    } catch (error) {
      logger.error("Failed to flush touch buffer during shutdown", error)
    }

    try {
      const publisher = await getQueuePublisher().catch(() => undefined)
      if (publisher) {
        await Effect.runPromise(publisher.close())
      }
    } catch (error) {
      logger.error("Error during shutdown", error)
    }

    await shutdownObservability()
    process.exit(0)
  }

  process.on("SIGTERM", () => {
    void handleShutdown("SIGTERM")
  })
  process.on("SIGINT", () => {
    void handleShutdown("SIGINT")
  })
}

void start().catch((error) => {
  const logger = createLogger("ingest")
  logger.error("Failed to start ingest", error)
  process.exit(1)
})
