import { getProjectSystemQueuesUseCase, type SystemQueueCacheEntry } from "@domain/annotation-queues"
import type { QueueConsumer, WorkflowStarterShape } from "@domain/queue"
import { deterministicSampling, OrganizationId, ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { AnnotationQueueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getPostgresClient, getRedisClient } from "../clients.ts"
import { createIterationProgress } from "../services/iteration-progress.ts"

const logger = createLogger("system-annotation-queues")
const FAN_OUT_PROGRESS_TTL_SECONDS = 24 * 60 * 60

interface SystemAnnotationQueuesDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
}

const isDefined = <T>(value: T | null): value is T => value !== null

const startWorkflowOnce = ({
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
  const jobId = `org:${organizationId}:projects:${projectId}:traces:${traceId}:system-queue-workflows-started`

  const progress = createIterationProgress({
    redisClient,
    jobId,
    ttlSeconds: FAN_OUT_PROGRESS_TTL_SECONDS,
  })

  return Effect.gen(function* () {
    const alreadyStarted = yield* progress.isComplete(workflowId)
    if (alreadyStarted) return false

    yield* workflowStarter.start(
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
    )

    yield* progress.markComplete(workflowId)

    return true
  })
}

const handleFanOut = (deps: SystemAnnotationQueuesDeps) => {
  const { workflowStarter } = deps

  return (payload: { readonly organizationId: string; readonly projectId: string; readonly traceId: string }) => {
    const postgresClient = getPostgresClient()
    const redisClient = getRedisClient()

    return Effect.gen(function* () {
      const queues = yield* getProjectSystemQueuesUseCase({
        organizationId: payload.organizationId,
        projectId: ProjectId(payload.projectId),
      }).pipe(
        withPostgres(AnnotationQueueRepositoryLive, postgresClient, OrganizationId(payload.organizationId)),
        Effect.provide(RedisCacheStoreLive(redisClient)),
      )

      const sampledQueues = yield* Effect.forEach(
        queues,
        (queue: SystemQueueCacheEntry) =>
          Effect.gen(function* () {
            if (queue.sampling <= 0) return null

            const isSampled = yield* Effect.promise(() =>
              deterministicSampling({
                sampling: queue.sampling,
                keyParts: [payload.organizationId, payload.projectId, payload.traceId, queue.queueSlug],
              }),
            )

            return isSampled ? queue : null
          }),
        { concurrency: "unbounded" },
      ).pipe(Effect.map((entries) => entries.filter(isDefined)))

      const startedWorkflows = yield* Effect.forEach(
        sampledQueues,
        (queue) =>
          startWorkflowOnce({
            redisClient,
            workflowStarter,
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: payload.traceId,
            queueSlug: queue.queueSlug,
          }),
        { concurrency: 1 },
      ).pipe(Effect.map((started) => started.filter(Boolean).length))

      yield* Effect.sync(() =>
        logger.info("System queue fan-out completed", {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          traceId: payload.traceId,
          totalQueues: queues.length,
          startedWorkflows,
        }),
      )
    })
  }
}

export const createSystemAnnotationQueuesWorker = (deps: SystemAnnotationQueuesDeps) => {
  const { consumer } = deps

  consumer.subscribe("system-annotation-queues", {
    fanOut: handleFanOut(deps),
  })
}
