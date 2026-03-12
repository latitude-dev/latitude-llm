import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createPollingOutboxConsumer } from "@platform/events-outbox"
import { createBullmqEventsPublisher } from "@platform/queue-bullmq"
import { createLogger } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { getClickhouseClient, getPostgresPool, getRedisConnection, getStorageDisk } from "./clients.ts"
import { createEventsWorker } from "./workers/events.ts"
import { createSpanIngestionWorker } from "./workers/span-ingestion.ts"

const nodeEnv = process.env.NODE_ENV || "development"
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const redisConnection = getRedisConnection()
const pgPool = getPostgresPool(10)
const { queue: eventsQueue, worker: eventsWorker } = createEventsWorker(redisConnection)
const eventsPublisher = createBullmqEventsPublisher({ queue: eventsQueue })
const outboxConsumer = createPollingOutboxConsumer(
  {
    pool: pgPool,
    pollIntervalMs: 1000,
    batchSize: 100,
  },
  eventsPublisher,
)

const { queue: spanIngestionQueue, worker: spanIngestionWorker } = createSpanIngestionWorker({
  redisConnection,
  clickhouseClient: getClickhouseClient(),
  storageDisk: getStorageDisk(),
})

const logger = createLogger("workers")

eventsWorker.on("ready", () => {
  outboxConsumer.start()

  logger.info("workers ready and outbox consumer started")
})

spanIngestionWorker.on("ready", () => {
  logger.info("span ingestion worker ready")
})

spanIngestionWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, storageKey: job?.data?.storageKey, error }, "span ingestion job failed")
})

process.on("SIGINT", async () => {
  await outboxConsumer.stop()
  await pgPool.end()
  await eventsQueue.close()
  await eventsWorker.close()
  await spanIngestionQueue.close()
  await spanIngestionWorker.close()
  process.exit(0)
})
