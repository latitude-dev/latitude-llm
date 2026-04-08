import { getProjectSystemQueuesUseCase, type SystemQueueCacheEntry } from "@domain/annotation-queues"
import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { AnnotationQueueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getPostgresClient, getRedisClient } from "../clients.ts"
import { deterministicSampling } from "../services/deterministic-sampling.ts"

const logger = createLogger("system-annotation-queues")

interface SystemAnnotationQueuesDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  workflowStarter: WorkflowStarterShape
}

/**
 * Handles the fan-out task for system annotation queues.
 *
 * Reads the project's active system queues from the cache (hydrating from DB on miss),
 * filters out queues with sampling=0, and publishes one gate task per candidate queue.
 *
 * The fan-out pattern isolates queue routing decisions from per-queue processing,
 * allowing each queue to be sampled and processed independently.
 *
 * @param deps - Dependencies including the queue publisher
 * @returns Async function that processes fan-out for a trace
 */
const handleFanOut = (deps: SystemAnnotationQueuesDeps) => {
  const { publisher } = deps

  return async (payload: { readonly organizationId: string; readonly projectId: string; readonly traceId: string }) => {
    const postgresClient = getPostgresClient()
    const redisClient = getRedisClient()

    // Read project system queues from cache (or hydrate from DB)
    // Provide both Postgres and Redis layers
    const queues = await Effect.runPromise(
      getProjectSystemQueuesUseCase({
        organizationId: payload.organizationId,
        projectId: ProjectId(payload.projectId),
      }).pipe(
        withPostgres(AnnotationQueueRepositoryLive, postgresClient, OrganizationId(payload.organizationId)),
        Effect.provide(RedisCacheStoreLive(redisClient)),
      ),
    )

    // Filter out queues with sampling = 0 and publish gate tasks
    const candidateQueues = queues.filter((queue: SystemQueueCacheEntry) => queue.sampling > 0)

    // Publish gate tasks for candidate queues
    await Effect.runPromise(
      Effect.all(
        candidateQueues.map((queue: SystemQueueCacheEntry) =>
          publisher.publish(
            "system-annotation-queues",
            "gate",
            {
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              traceId: payload.traceId,
              queueSlug: queue.queueSlug,
              sampling: queue.sampling,
            },
            {
              dedupeKey: `annotation-queues:system:gate:${payload.traceId}:${queue.queueSlug}`,
            },
          ),
        ),
        { concurrency: "unbounded" },
      ),
    )

    logger.info("System queue fan-out completed", {
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      traceId: payload.traceId,
      totalQueues: queues.length,
      candidateQueues: candidateQueues.length,
      skippedQueues: queues.length - candidateQueues.length,
    })
  }
}

/**
 * Handles the gate task for a single system annotation queue.
 *
 * Performs a deterministic sampling check using (organizationId, projectId, traceId, queueSlug)
 * as the hash input. If sampled in, starts a Temporal workflow for flagger processing.
 *
 * Duplicate workflow-start attempts are treated as success/no-op by the Temporal client.
 *
 * @param deps - Dependencies including the workflow starter
 * @returns Async function that processes the gate check for a queue
 */
const handleGate = (deps: SystemAnnotationQueuesDeps) => {
  const { workflowStarter } = deps

  return async (payload: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
    readonly queueSlug: string
    readonly sampling: number
  }) => {
    // Deterministic sampling decision (async, uses Web Crypto API)
    const isSampled = await deterministicSampling({
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      traceId: payload.traceId,
      queueSlug: payload.queueSlug,
      sampling: payload.sampling,
    })

    if (!isSampled) {
      logger.info("Trace sampled out for system queue", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        queueSlug: payload.queueSlug,
        sampling: payload.sampling,
      })
      return
    }

    // Start flagger workflow for this (traceId, queueSlug) pair
    const workflowId = `system-queue-flagger:${payload.traceId}:${payload.queueSlug}`

    await Effect.runPromise(
      workflowStarter.start(
        "systemQueueFlaggerWorkflow",
        {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          traceId: payload.traceId,
          queueSlug: payload.queueSlug,
        },
        {
          workflowId,
        },
      ),
    )

    logger.info("Started system queue flagger workflow", {
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      traceId: payload.traceId,
      queueSlug: payload.queueSlug,
      workflowId,
    })
  }
}

export const createSystemAnnotationQueuesWorker = (deps: SystemAnnotationQueuesDeps) => {
  const { consumer } = deps

  consumer.subscribe("system-annotation-queues", {
    fanOut: (payload) => Effect.promise(async () => handleFanOut(deps)(payload)),
    gate: (payload) => Effect.promise(async () => handleGate(deps)(payload)),
  })
}
