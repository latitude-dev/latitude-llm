import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
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
import { createSpanIngestionWorker } from "./workers/span-ingestion.ts"

const nodeEnv = process.env.NODE_ENV || "development"
// Only load .env file if import.meta.url is available (not in CJS bundles)
if (import.meta.url) {
  const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))
  if (existsSync(envFilePath)) {
    loadDotenv({ path: envFilePath, quiet: true })
  }
}

const pgPool = getPostgresPool(10)
const logger = createLogger("workers")
let ready = false

const healthPort = Number(process.env.LAT_WORKERS_HEALTH_PORT) || 9090
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
  handle: (event: {
    id: string
    event: { name: string; organizationId: string }
  }): Effect.Effect<void, unknown, never> =>
    Effect.gen(function* () {
      yield* Effect.logInfo(
        `Processing event ${event.id} of type ${event.event.name} for org ${event.event.organizationId}`,
      )
    }),
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

  outboxConsumer.start()
  await redpandaConsumer.start(eventHandler)
  await spanIngestionWorker.start()

  ready = true
  logger.info("workers ready - outbox consumer and Redpanda consumer started")

  return { outboxConsumer, redpandaConsumer, spanIngestionWorker }
}

const workersPromise = initializeWorkers().catch((error) => {
  logger.error("Failed to initialize workers", error)
  process.exit(1)
})

process.on("SIGINT", async () => {
  logger.info("shutting down workers...")
  ready = false
  healthServer.close()

  try {
    const { outboxConsumer, redpandaConsumer, spanIngestionWorker } = await workersPromise
    await outboxConsumer.stop()
    await redpandaConsumer.stop()
    await spanIngestionWorker.stop()
  } catch (error) {
    logger.error("Error during shutdown (workers may not have started)", error)
  }

  await pgPool.end()
  process.exit(0)
})
