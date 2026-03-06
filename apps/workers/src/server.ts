import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { createPollingOutboxConsumer } from "@platform/events-outbox"
import { createBullmqEventsPublisher } from "@platform/queue-bullmq"
import { createLogger } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { getPostgresPool, getRedisConnection } from "./clients.ts"
import { createEventsWorker } from "./workers/events.ts"

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

eventsWorker.on("ready", () => {
  outboxConsumer.start()
  ready = true

  logger.info("workers ready and outbox consumer started")
})

process.on("SIGINT", async () => {
  ready = false
  healthServer.close()
  await outboxConsumer.stop()
  await pgPool.end()
  await eventsQueue.close()
  await eventsWorker.close()
  process.exit(0)
})
