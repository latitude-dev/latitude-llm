import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { serve } from "@hono/node-server"
import { parseEnv } from "@platform/env"
import { createLogger } from "@repo/observability"
import { isHttpError, toHttpResponse } from "@repo/utils"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { Hono } from "hono"
import { getQueuePublisher } from "./clients.ts"
import { registerRoutes } from "./routes/index.ts"
import type { IngestEnv } from "./types.ts"

const nodeEnv = process.env.NODE_ENV || "development"
// Load .env file for local development; skipped in production containers where the file won't exist
if (import.meta.url) {
  const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))
  if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true })
}

const app = new Hono<IngestEnv>()
const port = Effect.runSync(parseEnv("LAT_INGEST_PORT", "number", 3002))

const logger = createLogger("ingest")

app.onError((err, c) => {
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
    const publisher = await getQueuePublisher().catch(() => undefined)
    if (publisher) {
      await Effect.runPromise(publisher.close())
    }
  } catch (error) {
    logger.error("Error during shutdown", error)
  }

  process.exit(0)
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"))
process.on("SIGINT", () => handleShutdown("SIGINT"))
