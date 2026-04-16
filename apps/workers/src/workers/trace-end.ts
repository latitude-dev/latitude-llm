import {
  AnnotationQueueRepository,
  getProjectSystemQueuesUseCase,
  LIVE_QUEUE_DEFAULT_SAMPLING,
  materializeLiveQueueItemsUseCase,
  type SystemQueueCacheEntry,
} from "@domain/annotation-queues"
import {
  buildLiveEvaluationExecutePublication,
  type Evaluation,
  getLiveEvaluationEligibility,
  listAllActiveEvaluations,
} from "@domain/evaluations"
import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { ScoreRepository } from "@domain/scores"
import { type FilterSet, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { selectTraceEndItemsUseCase, type TraceEndSelectionSpec, TraceRepository } from "@domain/spans"
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
import { createLogger } from "@repo/observability"
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

type DecisionCounts = {
  readonly selectedCount: number
  readonly sampledOutCount: number
  readonly filterMissCount: number
}

type MutableDecisionCounts = {
  selectedCount: number
  sampledOutCount: number
  filterMissCount: number
}

type EvaluationSummary = DecisionCounts & {
  readonly activeEvaluationsScanned: number
  readonly skippedIneligibleCount: number
  readonly skippedTurnCount: number
  readonly publishedExecuteCount: number
}

type LiveQueueSummary = DecisionCounts & {
  readonly liveQueuesScanned: number
  readonly insertedItemCount: number
}

type SystemQueueSummary = DecisionCounts & {
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

const summarizeSelections = (
  itemKeys: readonly string[],
  decisions: Readonly<Record<string, { reason: string }>>,
): DecisionCounts => {
  const summary: MutableDecisionCounts = {
    selectedCount: 0,
    sampledOutCount: 0,
    filterMissCount: 0,
  }

  for (const itemKey of itemKeys) {
    const reason = decisions[itemKey]?.reason

    if (reason === "selected") {
      summary.selectedCount += 1
    } else if (reason === "filter-miss") {
      summary.filterMissCount += 1
    } else {
      summary.sampledOutCount += 1
    }
  }

  return summary
}

const buildLiveEvaluationSelectionKey = (evaluationId: string) => `live-evaluation:${evaluationId}`
const buildLiveQueueSelectionKey = (queueId: string) => `live-queue:${queueId}`
const buildSystemQueueSelectionKey = (queueSlug: string) => `system-queue:${queueSlug}`

const publishLiveEvaluationExecute = ({
  publisher,
  input,
}: {
  readonly publisher: QueuePublisherShape
  readonly input: ReturnType<typeof buildLiveEvaluationExecutePublication>
}) =>
  publisher.publish(
    "live-evaluations",
    "execute",
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      evaluationId: input.evaluationId,
      traceId: input.traceId,
    },
    {
      ...(input.dedupeKey !== undefined ? { dedupeKey: input.dedupeKey } : {}),
      ...(input.debounceMs !== undefined ? { debounceMs: input.debounceMs } : {}),
    },
  )

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

export const runTraceEndUseCase =
  ({ publisher, workflowStarter, postgresClient, clickhouseClient, redisClient }: RunTraceEndDeps) =>
  (payload: TraceEndPayload) => {
    const evaluationByKey = new Map<string, Evaluation>()
    const liveQueueIdByKey = new Map<string, string>()
    const systemQueueByKey = new Map<string, SystemQueueCacheEntry>()

    return Effect.gen(function* () {
      const traceRepository = yield* TraceRepository
      const scoreRepository = yield* ScoreRepository
      const traceDetail = yield* traceRepository
        .findByTraceId({
          organizationId: OrganizationId(payload.organizationId),
          projectId: ProjectId(payload.projectId),
          traceId: TraceId(payload.traceId),
        })
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

      if (traceDetail === null) {
        return {
          action: "skipped",
          reason: "trace-not-found",
          traceId: payload.traceId,
        } satisfies TraceEndRunResult
      }

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

      const evaluationEligibility = activeEvaluations.map((evaluation) => ({
        evaluation,
        eligibility: getLiveEvaluationEligibility(evaluation),
      }))
      const skippedIneligibleCount = evaluationEligibility.reduce(
        (count, item) => (item.eligibility.eligible ? count : count + 1),
        0,
      )
      const eligibleEvaluations = evaluationEligibility.flatMap((item) =>
        item.eligibility.eligible ? [item.evaluation] : [],
      )

      const items = Object.create(null) as Record<string, TraceEndSelectionSpec>

      for (const evaluation of eligibleEvaluations) {
        const key = buildLiveEvaluationSelectionKey(evaluation.id)
        evaluationByKey.set(key, evaluation)
        items[key] = {
          sampling: evaluation.trigger.sampling,
          ...(evaluation.trigger.filter ? { filter: evaluation.trigger.filter as FilterSet } : {}),
          sampleKey: evaluation.id,
        }
      }

      for (const queue of liveQueues) {
        const key = buildLiveQueueSelectionKey(queue.id)
        liveQueueIdByKey.set(key, queue.id)
        items[key] = {
          sampling: queue.settings.sampling ?? LIVE_QUEUE_DEFAULT_SAMPLING,
          ...(queue.settings.filter ? { filter: queue.settings.filter } : {}),
          sampleKey: queue.id,
        }
      }

      for (const queue of systemQueues) {
        const key = buildSystemQueueSelectionKey(queue.queueSlug)
        systemQueueByKey.set(key, queue)
        items[key] = {
          sampling: queue.sampling,
          sampleKey: queue.queueSlug,
        }
      }

      const decisions = yield* selectTraceEndItemsUseCase({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        items,
      })

      const evaluationDecisionCounts = summarizeSelections([...evaluationByKey.keys()], decisions)
      const liveQueueDecisionCounts = summarizeSelections([...liveQueueIdByKey.keys()], decisions)
      const systemQueueDecisionCounts = summarizeSelections([...systemQueueByKey.keys()], decisions)

      const selectedEvaluations = [...evaluationByKey.entries()]
        .filter(([key]) => decisions[key]?.selected === true)
        .map(([, evaluation]) => evaluation)
      const selectedLiveQueueIds = [...liveQueueIdByKey.entries()]
        .filter(([key]) => decisions[key]?.selected === true)
        .map(([, queueId]) => queueId)
      const selectedSystemQueues = [...systemQueueByKey.entries()]
        .filter(([key]) => decisions[key]?.selected === true)
        .map(([, queue]) => queue)

      let skippedTurnCount = 0
      let publishedExecuteCount = 0

      for (const evaluation of selectedEvaluations) {
        if (evaluation.trigger.turn !== "first") {
          yield* publishLiveEvaluationExecute({
            publisher,
            input: buildLiveEvaluationExecutePublication({
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              traceId: payload.traceId,
              sessionId: traceDetail.sessionId ?? null,
              evaluation,
            }),
          })
          publishedExecuteCount += 1
          continue
        }

        const alreadyExists = yield* scoreRepository.existsByEvaluationIdAndScope({
          projectId: traceDetail.projectId,
          evaluationId: evaluation.id,
          traceId: traceDetail.traceId,
          sessionId: traceDetail.sessionId ?? null,
        })

        if (alreadyExists) {
          skippedTurnCount += 1
          continue
        }

        yield* publishLiveEvaluationExecute({
          publisher,
          input: buildLiveEvaluationExecutePublication({
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: payload.traceId,
            sessionId: traceDetail.sessionId ?? null,
            evaluation,
          }),
        })
        publishedExecuteCount += 1
      }

      const { insertedItemCount } = yield* materializeLiveQueueItemsUseCase({
        projectId: traceDetail.projectId,
        traceId: traceDetail.traceId,
        traceCreatedAt: traceDetail.startTime,
        queueIds: selectedLiveQueueIds,
      })

      const startedWorkflowCount = yield* Effect.forEach(
        selectedSystemQueues,
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

      return {
        action: "completed",
        summary: {
          traceId: traceDetail.traceId,
          sessionId: traceDetail.sessionId ?? null,
          evaluations: {
            ...evaluationDecisionCounts,
            activeEvaluationsScanned: activeEvaluations.length,
            skippedIneligibleCount,
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
    )
  }

export const createRunHandler =
  ({ log, ...deps }: RunTraceEndDeps & { readonly log: TraceEndLogger }) =>
  (payload: TraceEndPayload) =>
    runTraceEndUseCase(deps)(payload).pipe(
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
