import { createServer } from "node:http"
import { createPollingOutboxConsumer } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { createBullMqQueueConsumer, createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { createLogger, initializeObservability, shutdownObservability } from "@repo/observability"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { getClickhouseClient, getPostgresClient, getWorkflowStarter } from "./clients.ts"
import { createEventRouter } from "./events/event-router.ts"
import { createAnnotationScoresWorker } from "./workers/annotation-scores.ts"
import { createApiKeysWorker } from "./workers/api-keys.ts"
import { createDatasetExportWorker } from "./workers/dataset-export.ts"
import { createIssuesWorker } from "./workers/issues.ts"
import { createLiveAnnotationQueuesWorker } from "./workers/live-annotation-queues.ts"
import { createLiveEvaluationsWorker } from "./workers/live-evaluations.ts"
import { createLiveTracesWorker } from "./workers/live-traces.ts"
import { createMagicLinkEmailWorker } from "./workers/magic-link-email.ts"
import { createScoresWorker } from "./workers/scores.ts"
import { createSpanIngestionWorker } from "./workers/span-ingestion.ts"
import { createSystemAnnotationQueuesWorker } from "./workers/system-annotation-queues.ts"
import { createUserDeletionWorker } from "./workers/user-deletion.ts"

loadDevelopmentEnvironments(import.meta.url)

const bootstrap = async () => {
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

    const queueConsumer = await Effect.runPromise(createBullMqQueueConsumer({ redis: bullMqConfig }))

    const workflowStarter = await getWorkflowStarter()
    const eventRouter = createEventRouter(queuePublisher, workflowStarter)

    const outboxConsumer = await Effect.runPromise(
      createPollingOutboxConsumer(
        {
          pool: pgClient.pool,
          pollIntervalMs: 1000,
          batchSize: 100,
        },
        eventRouter,
      ),
    )

    createMagicLinkEmailWorker(queueConsumer)
    createUserDeletionWorker(queueConsumer)
    createApiKeysWorker(queueConsumer)
    createSpanIngestionWorker(queueConsumer, queuePublisher)
    createDatasetExportWorker(queueConsumer)
    createLiveTracesWorker(queueConsumer)
    createIssuesWorker(queueConsumer)
    createScoresWorker(queueConsumer)
    createAnnotationScoresWorker(queueConsumer)
    createLiveEvaluationsWorker(queueConsumer)
    createLiveAnnotationQueuesWorker(queueConsumer)
    createSystemAnnotationQueuesWorker(queueConsumer)

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

  process.on("SIGTERM", () => {
    void handleShutdown("SIGTERM")
  })
  process.on("SIGINT", () => {
    void handleShutdown("SIGINT")
  })
}

void bootstrap().catch((error) => {
  console.error(error)
  process.exit(1)
})
