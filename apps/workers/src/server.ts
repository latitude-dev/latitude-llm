import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import type { EventEnvelope } from "@domain/events"
import { parseEnv } from "@platform/env"
import { createPollingOutboxConsumer } from "@platform/events-outbox"
import {
  createKafkaClient,
  createRedpandaEventsConsumer,
  createRedpandaEventsPublisher,
  loadKafkaConfig,
} from "@platform/queue-redpanda"
import { createLogger } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { getPostgresPool } from "./clients.ts"
import { createDatasetExportWorker } from "./workers/dataset-export.ts"
import { createSpanIngestionWorker } from "./workers/span-ingestion.ts"

const nodeEnv = process.env.NODE_ENV || "development"
if (import.meta.url) {
  const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))
  if (existsSync(envFilePath)) {
    loadDotenv({ path: envFilePath, quiet: true })
  }
}

const pgPool = getPostgresPool(10)
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

const eventHandler = {
  handle: (event: EventEnvelope): Effect.Effect<void, unknown, never> =>
    Effect.logInfo(`Processing event ${event.id} of type ${event.event.name} for org ${event.event.organizationId}`),
}

const initializeWorkers = async () => {
  const kafkaConfig = Effect.runSync(loadKafkaConfig())
  const kafkaClient = createKafkaClient(kafkaConfig)

  const eventsPublisher = await createRedpandaEventsPublisher({
    kafka: kafkaClient,
  })

  const outboxConsumer = createPollingOutboxConsumer(
    {
      pool: pgPool,
      pollIntervalMs: 1000,
      batchSize: 100,
    },
    eventsPublisher,
  )

  const redpandaConsumer = createRedpandaEventsConsumer({
    kafka: kafkaClient,
    groupId: kafkaConfig.groupId,
  })

  const spanIngestionWorker = createSpanIngestionWorker(kafkaClient, `${kafkaConfig.groupId}-span-ingestion`)
  const datasetExportWorker = createDatasetExportWorker(kafkaClient, `${kafkaConfig.groupId}-dataset-export`)

  outboxConsumer.start()
  await redpandaConsumer.start(eventHandler)
  await spanIngestionWorker.start()
  await datasetExportWorker.start()

  ready = true
  logger.info("workers ready - outbox consumer and Redpanda consumer started")

  return { outboxConsumer, redpandaConsumer, spanIngestionWorker, datasetExportWorker }
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
    const { outboxConsumer, redpandaConsumer, spanIngestionWorker, datasetExportWorker } = await workersPromise
    await outboxConsumer.stop()
    await redpandaConsumer.stop()
    await spanIngestionWorker.stop()
    await datasetExportWorker.stop()
  } catch (error) {
    logger.error("Error during shutdown (workers may not have started)", error)
  }

  await pgPool.end()
  process.exit(0)
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"))
process.on("SIGINT", () => handleShutdown("SIGINT"))
