import { existsSync } from "node:fs"
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

const nodeEnv = process.env.NODE_ENV || "development"
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const pgPool = getPostgresPool(10)
const logger = createLogger("workers")

// Simple event handler that logs events (placeholder for actual side effect processing)
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

// Initialize workers asynchronously
const initializeWorkers = async () => {
  // Load Redpanda configuration
  const kafkaConfig = Effect.runSync(loadKafkaConfig())
  const kafkaClient = createKafkaClient(kafkaConfig)

  // Create Redpanda publisher (async initialization)
  const eventsPublisher = await createRedpandaEventsPublisher({
    kafka: kafkaClient,
  })

  // Create outbox consumer (polls Postgres outbox and publishes to Redpanda)
  const outboxConsumer = createPollingOutboxConsumer(
    {
      pool: pgPool,
      pollIntervalMs: 1000,
      batchSize: 100,
    },
    eventsPublisher,
  )

  // Create Redpanda event consumer (consumes from Redpanda and processes events)
  const redpandaConsumer = createRedpandaEventsConsumer({
    kafka: kafkaClient,
    groupId: kafkaConfig.groupId,
  })

  // Start consumers
  outboxConsumer.start()
  await redpandaConsumer.start(eventHandler)
  logger.info("workers ready - outbox consumer and Redpanda consumer started")

  return { outboxConsumer, redpandaConsumer }
}

const workersPromise = initializeWorkers().catch((error) => {
  logger.error("Failed to initialize workers", error)
  process.exit(1)
})

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("shutting down workers...")
  try {
    const { outboxConsumer, redpandaConsumer } = await workersPromise
    await outboxConsumer.stop()
    await redpandaConsumer.stop()
  } catch (error) {
    logger.error("Error during shutdown (workers may not have started)", error)
  }
  await pgPool.end()

  process.exit(0)
})
