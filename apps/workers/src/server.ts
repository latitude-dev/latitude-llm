import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { parseEnv } from "@platform/env"
import { createPollingOutboxConsumer } from "@platform/events-outbox"
import {
  createEventsPublisher,
  createKafkaClient,
  createRedpandaQueueConsumer,
  createRedpandaQueuePublisher,
  loadKafkaConfig,
} from "@platform/queue-redpanda"
import { createLogger } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { getPostgresPool } from "./clients.ts"
import { createDatasetExportWorker } from "./workers/dataset-export.ts"
import { createDomainEventsWorker } from "./workers/domain-events.ts"
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

const initializeWorkers = async () => {
  const kafkaConfig = Effect.runSync(loadKafkaConfig())
  const kafkaClient = createKafkaClient(kafkaConfig)
  const queuePublisher = await Effect.runPromise(createRedpandaQueuePublisher({ kafka: kafkaClient }))
  const eventsPublisher = createEventsPublisher(queuePublisher)

  const outboxConsumer = createPollingOutboxConsumer(
    {
      pool: pgPool,
      pollIntervalMs: 1000,
      batchSize: 100,
    },
    eventsPublisher,
  )

  const domainEventsConsumer = await Effect.runPromise(
    createRedpandaQueueConsumer({ kafka: kafkaClient, groupId: `${kafkaConfig.groupId}-domain-events` }),
  )
  const spanIngestionConsumer = await Effect.runPromise(
    createRedpandaQueueConsumer({ kafka: kafkaClient, groupId: `${kafkaConfig.groupId}-span-ingestion` }),
  )
  const datasetExportConsumer = await Effect.runPromise(
    createRedpandaQueueConsumer({ kafka: kafkaClient, groupId: `${kafkaConfig.groupId}-dataset-export` }),
  )

  const domainEventsWorker = createDomainEventsWorker(domainEventsConsumer)
  const spanIngestionWorker = createSpanIngestionWorker(spanIngestionConsumer)
  const datasetExportWorker = createDatasetExportWorker(datasetExportConsumer)

  outboxConsumer.start()

  await domainEventsWorker.start()
  await spanIngestionWorker.start()
  await datasetExportWorker.start()

  ready = true
  logger.info("workers ready - outbox consumer and queue consumers started")

  return { consumers: { outboxConsumer }, workers: { domainEventsWorker, spanIngestionWorker, datasetExportWorker } }
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
    const { consumers, workers } = await workersPromise

    await consumers.outboxConsumer.stop()
    await Promise.allSettled(Object.values(workers).map((worker) => worker.stop()))
  } catch (error) {
    logger.error("Error during shutdown (workers may not have started)", error)
  }

  await pgPool.end()

  process.exit(0)
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"))
process.on("SIGINT", () => handleShutdown("SIGINT"))
