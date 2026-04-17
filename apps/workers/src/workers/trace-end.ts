import {
  AnnotationQueueRepository,
  buildTraceEndLiveQueueSelectionInputs,
  buildTraceEndSystemQueueSelectionInputs,
  getProjectSystemQueuesUseCase,
  orchestrateTraceEndLiveQueueMaterializationUseCase,
  orchestrateTraceEndSystemQueueWorkflowStartsUseCase,
} from "@domain/annotation-queues"
import {
  buildTraceEndEvaluationSelectionInputs,
  listAllActiveEvaluations,
  orchestrateTraceEndLiveEvaluationExecutesUseCase,
} from "@domain/evaluations"
import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import {
  loadTraceForTraceEndUseCase,
  selectTraceEndItemsUseCase,
  summarizeTraceEndItemDecisions,
  type TraceEndItemDecisionCounts,
} from "@domain/spans"
import { RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import { type ClickHouseClient, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AnnotationQueueItemRepositoryLive,
  AnnotationQueueRepositoryLive,
  EvaluationRepositoryLive,
  type PostgresClient,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { createIterationProgress } from "../services/iteration-progress.ts"

const logger = createLogger("trace-end")
const TRACE_END_QUEUE = "trace-end" as const
const TRACE_END_RUN_TASK = "run" as const
const SYSTEM_QUEUE_PROGRESS_TTL_SECONDS = 24 * 60 * 60

interface TraceEndPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

type TraceEndLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface TraceEndDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  workflowStarter: WorkflowStarterShape
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
  logger?: TraceEndLogger
}

interface RunTraceEndDeps {
  readonly publisher: QueuePublisherShape
  readonly workflowStarter: WorkflowStarterShape
  readonly postgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
  readonly redisClient: RedisClient
}

type EvaluationSummary = TraceEndItemDecisionCounts & {
  readonly activeEvaluationsScanned: number
  readonly skippedIneligibleCount: number
  readonly skippedTurnCount: number
  readonly publishedExecuteCount: number
}

type LiveQueueSummary = TraceEndItemDecisionCounts & {
  readonly liveQueuesScanned: number
  readonly insertedItemCount: number
}

type SystemQueueSummary = TraceEndItemDecisionCounts & {
  readonly systemQueuesScanned: number
  readonly startedWorkflowCount: number
}

type TraceEndRunSummary = {
  readonly traceId: string
  readonly sessionId: string | null
  readonly evaluations: EvaluationSummary
  readonly liveQueues: LiveQueueSummary
  readonly systemQueues: SystemQueueSummary
}

type TraceEndRunResult =
  | {
      readonly action: "skipped"
      readonly reason: "trace-not-found"
      readonly traceId: string
    }
  | {
      readonly action: "completed"
      readonly summary: TraceEndRunSummary
    }

const buildRunLogContext = (payload: TraceEndPayload) => ({
  queue: TRACE_END_QUEUE,
  task: TRACE_END_RUN_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  traceId: payload.traceId,
})

const startWorkflowOnce = ({
  redisClient,
  workflowStarter,
  organizationId,
  projectId,
  traceId,
  queueSlug,
}: {
  readonly redisClient: RedisClient
  readonly workflowStarter: WorkflowStarterShape
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}) => {
  const workflowId = `system-queue-flagger:${traceId}:${queueSlug}`
  const jobId = `org:${organizationId}:projects:${projectId}:traces:${traceId}:system-queue-workflows-started`

  const progress = createIterationProgress({
    redisClient,
    jobId,
    ttlSeconds: SYSTEM_QUEUE_PROGRESS_TTL_SECONDS,
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

export const runTraceEndJob =
  ({ publisher, workflowStarter, postgresClient, clickhouseClient, redisClient }: RunTraceEndDeps) =>
  (payload: TraceEndPayload) =>
    Effect.gen(function* () {
      const loaded = yield* loadTraceForTraceEndUseCase(payload)

      if (loaded.kind === "skipped") {
        return {
          action: "skipped",
          reason: "trace-not-found",
          traceId: payload.traceId,
        } satisfies TraceEndRunResult
      }

      const traceDetail = loaded.traceDetail

      const [activeEvaluations, liveQueues, systemQueues] = yield* Effect.all(
        [
          listAllActiveEvaluations({
            projectId: traceDetail.projectId,
          }),
          Effect.gen(function* () {
            const queueRepository = yield* AnnotationQueueRepository
            return yield* queueRepository.listLiveQueuesByProject({
              projectId: traceDetail.projectId,
            })
          }),
          getProjectSystemQueuesUseCase({
            organizationId: payload.organizationId,
            projectId: traceDetail.projectId,
          }),
        ],
        { concurrency: "unbounded" },
      )

      const evalBuilt = buildTraceEndEvaluationSelectionInputs(activeEvaluations)
      const liveBuilt = buildTraceEndLiveQueueSelectionInputs(liveQueues)
      const sysBuilt = buildTraceEndSystemQueueSelectionInputs(systemQueues)

      const items = {
        ...evalBuilt.items,
        ...liveBuilt.items,
        ...sysBuilt.items,
      }

      const decisions = yield* selectTraceEndItemsUseCase({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        items,
      })

      const evaluationDecisionCounts = summarizeTraceEndItemDecisions([...evalBuilt.evaluationByKey.keys()], decisions)
      const liveQueueDecisionCounts = summarizeTraceEndItemDecisions([...liveBuilt.liveQueueIdByKey.keys()], decisions)
      const systemQueueDecisionCounts = summarizeTraceEndItemDecisions([...sysBuilt.systemQueueByKey.keys()], decisions)

      const selectedEvaluations = [...evalBuilt.evaluationByKey.entries()]
        .filter(([key]) => decisions[key]?.selected === true)
        .map(([, evaluation]) => evaluation)
      const selectedLiveQueueIds = [...liveBuilt.liveQueueIdByKey.entries()]
        .filter(([key]) => decisions[key]?.selected === true)
        .map(([, queueId]) => queueId)
      const selectedSystemQueues = [...sysBuilt.systemQueueByKey.entries()]
        .filter(([key]) => decisions[key]?.selected === true)
        .map(([, queue]) => queue)

      const { skippedTurnCount, publishedExecuteCount } = yield* orchestrateTraceEndLiveEvaluationExecutesUseCase({
        publishExecute: (pubInput) =>
          publisher.publish(
            "live-evaluations",
            "execute",
            {
              organizationId: pubInput.organizationId,
              projectId: pubInput.projectId,
              evaluationId: pubInput.evaluationId,
              traceId: pubInput.traceId,
            },
            {
              ...(pubInput.dedupeKey !== undefined ? { dedupeKey: pubInput.dedupeKey } : {}),
              ...(pubInput.debounceMs !== undefined ? { debounceMs: pubInput.debounceMs } : {}),
            },
          ),
      })({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        traceProjectId: traceDetail.projectId,
        traceRowId: traceDetail.traceId,
        sessionId: traceDetail.sessionId ?? null,
        selectedEvaluations,
      })

      const { insertedItemCount } = yield* orchestrateTraceEndLiveQueueMaterializationUseCase({
        traceProjectId: traceDetail.projectId,
        traceRowId: traceDetail.traceId,
        traceCreatedAt: traceDetail.startTime,
        selectedLiveQueueIds,
      })

      const { startedWorkflowCount } = yield* orchestrateTraceEndSystemQueueWorkflowStartsUseCase({
        startOnce: (args) =>
          startWorkflowOnce({
            redisClient,
            workflowStarter,
            organizationId: args.organizationId,
            projectId: args.projectId,
            traceId: args.traceId,
            queueSlug: args.queueSlug,
          }),
      })({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        selectedSystemQueues,
      })

      return {
        action: "completed",
        summary: {
          traceId: traceDetail.traceId,
          sessionId: traceDetail.sessionId ?? null,
          evaluations: {
            ...evaluationDecisionCounts,
            activeEvaluationsScanned: activeEvaluations.length,
            skippedIneligibleCount: evalBuilt.skippedIneligibleCount,
            skippedTurnCount,
            publishedExecuteCount,
          },
          liveQueues: {
            ...liveQueueDecisionCounts,
            liveQueuesScanned: liveQueues.length,
            insertedItemCount,
          },
          systemQueues: {
            ...systemQueueDecisionCounts,
            systemQueuesScanned: systemQueues.length,
            startedWorkflowCount,
          },
        },
      } satisfies TraceEndRunResult
    }).pipe(
      withPostgres(
        Layer.mergeAll(
          AnnotationQueueItemRepositoryLive,
          AnnotationQueueRepositoryLive,
          EvaluationRepositoryLive,
          ScoreRepositoryLive,
        ),
        postgresClient,
        OrganizationId(payload.organizationId),
      ),
      withClickHouse(TraceRepositoryLive, clickhouseClient, OrganizationId(payload.organizationId)),
      Effect.provide(RedisCacheStoreLive(redisClient)),
      withTracing,
    )

export const createRunHandler =
  ({ log, ...deps }: RunTraceEndDeps & { readonly log: TraceEndLogger }) =>
  (payload: TraceEndPayload) =>
    runTraceEndJob(deps)(payload).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          if (result.action === "skipped") {
            log.info("Trace-end runtime skipped", {
              ...buildRunLogContext(payload),
              outcome: result.action,
              reason: result.reason,
            })
            return
          }

          log.info("Trace-end runtime completed", {
            ...buildRunLogContext(payload),
            outcome: result.action,
            sessionId: result.summary.sessionId,
            evaluations: result.summary.evaluations,
            liveQueues: result.summary.liveQueues,
            systemQueues: result.summary.systemQueues,
          })
        }),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          log.error("Trace-end runtime failed", {
            ...buildRunLogContext(payload),
            outcome: "failed",
            error,
          }),
        ),
      ),
      Effect.asVoid,
    )

export const createTraceEndWorker = ({
  consumer,
  publisher,
  workflowStarter,
  postgresClient,
  clickhouseClient,
  redisClient,
  logger: injectedLogger,
}: TraceEndDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()
  const traceEndLogger = injectedLogger ?? logger

  consumer.subscribe(TRACE_END_QUEUE, {
    run: createRunHandler({
      log: traceEndLogger,
      publisher,
      workflowStarter,
      postgresClient: pgClient,
      clickhouseClient: chClient,
      redisClient: rdClient,
    }),
  })
}
