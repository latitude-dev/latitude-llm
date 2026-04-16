import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { HonoAdapter } from "@bull-board/hono"
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { createPollingOutboxConsumer } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import {
  createBullMqQueueConsumer,
  createBullMqQueuePublisher,
  createEventsPublisher,
  loadBullMqConfig,
} from "@platform/queue-bullmq"
import {
  createLogger,
  initializeObservability,
  recordSpanExceptionForDatadog,
  shutdownObservability,
  trace,
} from "@repo/observability"
import { LatitudeObservabilityTestError } from "@repo/utils"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { Hono } from "hono"
import { basicAuth } from "hono/basic-auth"
import { getClickhouseClient, getPostgresClient, getPostHogClient, getWorkflowStarter } from "./clients.ts"
import { createAnnotationQueuesWorker } from "./workers/annotation-queues.ts"
import { createAnnotationScoresWorker } from "./workers/annotation-scores.ts"
import { createApiKeysWorker } from "./workers/api-keys.ts"
import { createDatasetExportWorker } from "./workers/dataset-export.ts"
import { createInvitationEmailWorker } from "./workers/domain-events/invitation-email.ts"
import { createMagicLinkEmailWorker } from "./workers/domain-events/magic-link-email.ts"
import { createUserDeletionWorker } from "./workers/domain-events/user-deletion.ts"
import { createDomainEventsWorker } from "./workers/domain-events.ts"
import { createEvaluationsWorker } from "./workers/evaluations.ts"
import { createIssuesWorker } from "./workers/issues.ts"
import { createLiveAnnotationQueuesWorker } from "./workers/live-annotation-queues.ts"
import { createLiveEvaluationsWorker } from "./workers/live-evaluations.ts"
import { createPostHogAnalyticsWorker } from "./workers/posthog-analytics.ts"
import { createProjectsWorker } from "./workers/projects.ts"
import { createScoresWorker } from "./workers/scores.ts"
import { createSpanIngestionWorker } from "./workers/span-ingestion.ts"
import { createSystemAnnotationQueuesWorker } from "./workers/system-annotation-queues.ts"

loadDevelopmentEnvironments(import.meta.url)

const log = createLogger("workers")

const bootstrap = async () => {
  await initializeObservability({
    serviceName: "workers",
  })

  const pgClient = getPostgresClient(10)
  const logger = log
  let ready = false

  const healthPort = Effect.runSync(parseEnv("LAT_WORKERS_HEALTH_PORT", "number", 9090))

  const app = new Hono()

  app.get("/health/observability-test", (c) => {
    return c.json({ service: "workers", observabilityTest: "armed" })
  })

  app.get("/health/observability-test/error", (c) => {
    const err = new LatitudeObservabilityTestError("workers")
    logger.error(err)
    const span = trace.getActiveSpan()
    if (span) {
      recordSpanExceptionForDatadog(span, err)
    }
    return c.json({ name: err.name, message: err.message }, 500)
  })

  app.get("/health", (c) => {
    const status = ready ? 200 : 503
    return c.json({ status: ready ? "ok" : "starting" }, status)
  })

  const server = serve({ fetch: app.fetch, port: healthPort }, () => {
    logger.info(`workers health check listening on :${healthPort}/health`)
  })

  const initializeWorkers = async () => {
    const bullMqConfig = Effect.runSync(loadBullMqConfig())

    // Set up bull-board dashboard with read-only Queue instances
    const { TOPIC_NAMES } = await import("@domain/queue")
    const { createBullBoardQueues } = await import("@platform/queue-bullmq")
    const bullBoardQueues = createBullBoardQueues(bullMqConfig, TOPIC_NAMES)

    const bullBoardUser = Effect.runSync(parseEnv("LAT_BULL_BOARD_USERNAME", "string"))
    const bullBoardPass = Effect.runSync(parseEnv("LAT_BULL_BOARD_PASSWORD", "string"))
    app.use("/bull-board/*", basicAuth({ username: bullBoardUser, password: bullBoardPass }))

    const serverAdapter = new HonoAdapter(serveStatic)
    serverAdapter.setBasePath("/bull-board")
    createBullBoard({
      queues: bullBoardQueues.map((q) => new BullMQAdapter(q, { readOnlyMode: true })),
      serverAdapter,
    })
    app.route("/bull-board", serverAdapter.registerPlugin())

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

    const queueConsumer = await Effect.runPromise(
      createBullMqQueueConsumer({
        redis: bullMqConfig,
        onWorkerIncident: (incident) => {
          if (incident.kind === "worker_error") {
            logger.error("BullMQ worker infrastructure error", incident.queue, incident.error)
            return
          }
          if (incident.kind === "job_failed") {
            logger.error("BullMQ job failed", incident.queue, incident.job, incident.error)
            return
          }
          logger.warn("BullMQ job stalled", incident.queue, incident.jobId)
        },
      }),
    )
    const workflowStarter = await getWorkflowStarter()

    const ctx = {
      consumer: queueConsumer,
      publisher: queuePublisher,
      eventsPublisher,
      workflowStarter,
    }

    createDomainEventsWorker(ctx)
    createMagicLinkEmailWorker(ctx)
    createInvitationEmailWorker(ctx)
    createUserDeletionWorker(ctx)
    createApiKeysWorker(ctx)
    createSpanIngestionWorker(ctx)
    createDatasetExportWorker(ctx)
    await createIssuesWorker(ctx)
    createEvaluationsWorker(ctx)
    createAnnotationScoresWorker(ctx)
    createLiveEvaluationsWorker(ctx)
    createAnnotationQueuesWorker(ctx)
    createLiveAnnotationQueuesWorker(ctx)
    createSystemAnnotationQueuesWorker(ctx)
    createProjectsWorker(ctx)
    createScoresWorker(ctx)
    createPostHogAnalyticsWorker(ctx)

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
    server.close()

    try {
      const { consumers, queuePublisher } = await workersPromise

      await Effect.runPromise(consumers.outboxConsumer.stop())
      await Effect.runPromise(consumers.queueConsumer.stop())
      await Effect.runPromise(queuePublisher.close())
      // Flush in-flight PostHog events before process exit. No-op when the
      // integration isn't configured.
      await getPostHogClient()
        .shutdown()
        .catch((error) => logger.warn("PostHog shutdown failed", error))
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
  log.error("Failed to bootstrap workers", error)
  process.exit(1)
})
