import { getProjectSystemQueuesUseCase, type SystemQueueCacheEntry } from "@domain/annotation-queues"
import type { QueueConsumer, WorkflowStarterShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { AnnotationQueueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getPostgresClient, getRedisClient } from "../clients.ts"
import { deterministicSampling } from "../services/deterministic-sampling.ts"

const logger = createLogger("system-annotation-queues")
const FAN_OUT_PROGRESS_TTL_SECONDS = 24 * 60 * 60

interface SystemAnnotationQueuesDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
}

const isDefined = <T>(value: T | null): value is T => value !== null

const buildFanOutProgressKey = (organizationId: string, projectId: string, traceId: string) =>
  `org:${organizationId}:projects:${projectId}:traces:${traceId}:system-queue-workflows-started`

const startWorkflowOnce = async ({
  redisClient,
  workflowStarter,
  organizationId,
  projectId,
  traceId,
  queueSlug,
}: {
  redisClient: ReturnType<typeof getRedisClient>
  workflowStarter: WorkflowStarterShape
  organizationId: string
  projectId: string
  traceId: string
  queueSlug: string
}) => {
  const workflowId = `system-queue-flagger:${traceId}:${queueSlug}`
  const progressKey = buildFanOutProgressKey(organizationId, projectId, traceId)

  const alreadyStarted = await redisClient.sismember(progressKey, workflowId)
  if (alreadyStarted === 1) return false

  await Effect.runPromise(
    workflowStarter.start(
      "systemQueueFlaggerWorkflow",
      {
        organizationId,
        projectId,
        traceId,
        queueSlug,
      },
      {
        workflowId,
      },
    ),
  )

  await redisClient.multi().sadd(progressKey, workflowId).expire(progressKey, FAN_OUT_PROGRESS_TTL_SECONDS).exec()
  return true
}

const handleFanOut = (deps: SystemAnnotationQueuesDeps) => {
  const { workflowStarter } = deps

  return async (payload: { readonly organizationId: string; readonly projectId: string; readonly traceId: string }) => {
    const postgresClient = getPostgresClient()
    const redisClient = getRedisClient()

    const queues = await Effect.runPromise(
      getProjectSystemQueuesUseCase({
        organizationId: payload.organizationId,
        projectId: ProjectId(payload.projectId),
      }).pipe(
        withPostgres(AnnotationQueueRepositoryLive, postgresClient, OrganizationId(payload.organizationId)),
        Effect.provide(RedisCacheStoreLive(redisClient)),
      ),
    )

    const sampledQueues = await Effect.runPromise(
      Effect.forEach(
        queues,
        (queue: SystemQueueCacheEntry) =>
          Effect.promise(async () => {
            if (queue.sampling <= 0) return null

            const isSampled = await deterministicSampling({
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              traceId: payload.traceId,
              queueSlug: queue.queueSlug,
              sampling: queue.sampling,
            })

            return isSampled ? queue : null
          }),
        { concurrency: "unbounded" },
      ).pipe(Effect.map((entries) => entries.filter(isDefined))),
    )

    let startedWorkflows = 0
    for (const queue of sampledQueues) {
      const started = await startWorkflowOnce({
        redisClient,
        workflowStarter,
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        queueSlug: queue.queueSlug,
      })

      if (started) startedWorkflows += 1
    }

    logger.info("System queue fan-out completed", {
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      traceId: payload.traceId,
      totalQueues: queues.length,
      startedWorkflows,
    })
  }
}

export const createSystemAnnotationQueuesWorker = (deps: SystemAnnotationQueuesDeps) => {
  const { consumer } = deps

  consumer.subscribe("system-annotation-queues", {
    fanOut: (payload) => Effect.promise(async () => handleFanOut(deps)(payload)),
  })
}
