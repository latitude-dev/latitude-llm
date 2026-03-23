import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { parseEnv } from "@platform/env"
import { createPollingOutboxConsumer } from "@platform/events-outbox"
import {
  createBullMqQueueConsumer,
  createBullMqQueuePublisher,
  createEventsPublisher,
  loadBullMqConfig,
} from "@platform/queue-bullmq"
import { createLogger, initializeObservability, shutdownObservability } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { getClickhouseClient, getPostgresClient } from "./clients.ts"
import { createDatasetExportWorker } from "./workers/dataset-export.ts"
import { createDomainEventsWorker } from "./workers/domain-events.ts"
import { createMagicLinkEmailWorker } from "./workers/magic-link-email.ts"
import { createSpanIngestionWorker } from "./workers/span-ingestion.ts"

const nodeEnv = process.env.NODE_ENV || "development"
if (import.meta.url) {
  const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))
  if (existsSync(envFilePath)) {
    loadDotenv({ path: envFilePath, quiet: true })
  }
}

await initializeObservability({
  serviceName: "workers",
})

const pgClient = getPostgresClient(10)
const logger = createLogger("workers")
let ready = false

const healthPort = Effect.runSync(parseEnv("LAT_WORKERS_HEALTH_PORT", "number", 9090))
const healthServer = createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    const status = ready ? 200 : 503
    res.writeHead(status, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: ready ? "ok" : "starting" }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

healthServer.listen(healthPort, () => {
  logger.info(`workers health check listening on :${healthPort}/health`)
})

const initializeWorkers = async () => {
  const bullMqConfig = Effect.runSync(loadBullMqConfig())
  const queuePublisher = await Effect.runPromise(createBullMqQueuePublisher({ redis: bullMqConfig }))
  const eventsPublisher = createEventsPublisher(queuePublisher)

  const outboxConsumer = await Effect.runPromise(
    createPollingOutboxConsumer(
      {
        pool: pgClient.pool,
        pollIntervalMs: 1000,
        batchSize: 100,
      },
      eventsPublisher,
    ),
  )

  const queueConsumer = await Effect.runPromise(createBullMqQueueConsumer({ redis: bullMqConfig }))

  createDomainEventsWorker(queueConsumer)
  createSpanIngestionWorker(queueConsumer)
  createDatasetExportWorker(queueConsumer)
  createMagicLinkEmailWorker(queueConsumer)

  await Effect.runPromise(outboxConsumer.start())
  await Effect.runPromise(queueConsumer.start())

  ready = true
  logger.info("workers ready - outbox consumer and queue consumer started")

  return { consumers: { outboxConsumer, queueConsumer }, queuePublisher }
}

const workersPromise = initializeWorkers().catch((error) => {
  logger.error("Failed to initialize workers", error)
  process.exit(1)
})

const handleShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down workers...`)
  ready = false
  healthServer.close()

  try {
    const { consumers, queuePublisher } = await workersPromise

    await Effect.runPromise(consumers.outboxConsumer.stop())
    await Effect.runPromise(consumers.queueConsumer.stop())
    await Effect.runPromise(queuePublisher.close())
  } catch (error) {
    logger.error("Error during shutdown (workers may not have started)", error)
  }

  await shutdownObservability()
  await pgClient.pool.end()
  await getClickhouseClient().close()
  process.exit(0)
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"))
process.on("SIGINT", () => handleShutdown("SIGINT"))
