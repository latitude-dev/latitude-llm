import {
  AnnotationQueueRepository,
  buildTraceEndLiveQueueSelectionInputs,
  orchestrateTraceEndLiveQueueMaterializationUseCase,
} from "@domain/annotation-queues"
import { CONVERSATION_INTELLIGENCE_ANALYSIS_DEBOUNCE_MS } from "@domain/conversation-intelligence"
import {
  buildTraceEndEvaluationSelectionInputs,
  listAllActiveEvaluations,
  orchestrateTraceEndLiveEvaluationExecutesUseCase,
} from "@domain/evaluations"
import { SAVED_SEARCH_MONITORS_THROTTLE_MS, savedSearchMonitorsCheckDedupeKey } from "@domain/monitors"
import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import {
  loadTraceForTraceEndUseCase,
  selectTraceEndItemsUseCase,
  summarizeTraceEndItemDecisions,
  type TraceEndItemDecisionCounts,
} from "@domain/spans"
import { RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import {
  type ClickHouseClient,
  ScoreAnalyticsRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  AnnotationQueueItemRepositoryLive,
  AnnotationQueueRepositoryLive,
  EvaluationRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

import { getClickhouseClient, getPostgresClient, getRedisClient, getWorkflowStarter } from "../clients.ts"

const logger = createLogger("trace-end")
const TRACE_END_QUEUE = "trace-end" as const
const TRACE_END_RUN_TASK = "run" as const

interface TraceEndPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly isSandbox?: boolean
}

type TraceEndLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface TraceEndDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
  logger?: TraceEndLogger
  workflowStarter?: WorkflowStarterShape
}

interface RunTraceEndDeps {
  readonly publisher: QueuePublisherShape
  readonly postgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
  readonly redisClient: RedisClient
  readonly workflowStarter: WorkflowStarterShape
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

type TraceEndRunSummary = {
  readonly traceId: string
  readonly sessionId: string | null
  readonly evaluations: EvaluationSummary
  readonly liveQueues: LiveQueueSummary
  readonly deterministicFlaggersEnqueued: boolean
}

type TraceEndRunResult =
  | {
      readonly action: "skipped"
      readonly reason: "trace-not-found" | "sandbox"
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

export const runTraceEndJob =
  ({ publisher, postgresClient, clickhouseClient, redisClient, workflowStarter }: RunTraceEndDeps) =>
  (payload: TraceEndPayload) =>
    Effect.gen(function* () {
      if (payload.isSandbox) {
        return { action: "skipped", reason: "sandbox", traceId: payload.traceId } satisfies TraceEndRunResult
      }

      const loaded = yield* loadTraceForTraceEndUseCase(payload)

      if (loaded.kind === "skipped") {
        return {
          action: "skipped",
          reason: "trace-not-found",
          traceId: payload.traceId,
        } satisfies TraceEndRunResult
      }

      const traceDetail = loaded.traceDetail

      const [activeEvaluations, liveQueues] = yield* Effect.all(
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
        ],
        { concurrency: "unbounded" },
      )

      const evalBuilt = buildTraceEndEvaluationSelectionInputs(activeEvaluations)
      const liveBuilt = buildTraceEndLiveQueueSelectionInputs(liveQueues)

      const items = {
        ...evalBuilt.items,
        ...liveBuilt.items,
      }

      const decisions = yield* selectTraceEndItemsUseCase({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        items,
      })

      const evaluationDecisionCounts = summarizeTraceEndItemDecisions([...evalBuilt.evaluationByKey.keys()], decisions)
      const liveQueueDecisionCounts = summarizeTraceEndItemDecisions([...liveBuilt.liveQueueIdByKey.keys()], decisions)

      const selectedEvaluations = [...evalBuilt.evaluationByKey.entries()]
        .filter(([key]) => decisions[key]?.selected === true)
        .map(([, evaluation]) => evaluation)
      const selectedLiveQueueIds = [...liveBuilt.liveQueueIdByKey.entries()]
        .filter(([key]) => decisions[key]?.selected === true)
        .map(([, queueId]) => queueId)

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

      // Hand the deterministic-flagger fan-out to its own worker. Per-strategy
      // isolation (Effect.catch) lives there, so a broken detector can't
      // fail the whole trace-end job.
      const deterministicFlaggersEnqueued = yield* publisher
        .publish(
          "deterministic-flaggers",
          "run",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: payload.traceId,
          },
          {
            dedupeKey: `deterministic-flaggers:${payload.traceId}`,
          },
        )
        .pipe(
          Effect.map(() => true),
          Effect.catch((error) =>
            Effect.gen(function* () {
              yield* Effect.logError("Failed to enqueue deterministic-flaggers", {
                ...buildRunLogContext(payload),
                error,
              })
              return false
            }),
          ),
        )

      // Publish trace-search refresh task after successful trace-end completion
      yield* publisher.publish("trace-search", "refreshTrace", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        startTime: traceDetail.startTime.toISOString(),
        rootSpanName: traceDetail.rootSpanName,
        isSandbox: payload.isSandbox ?? false,
      })

      // Saved-search firing check, throttled to one run per project per 5 min.
      // Leading-edge: runs immediately so its trailing evaluation window covers
      // the traces that triggered it, instead of sliding 5 min past them.
      yield* publisher
        .publish(
          "monitors",
          "checkSavedSearchMonitors",
          { organizationId: payload.organizationId, projectId: payload.projectId },
          {
            dedupeKey: savedSearchMonitorsCheckDedupeKey({
              organizationId: payload.organizationId,
              projectId: payload.projectId,
            }),
            leadingThrottleMs: SAVED_SEARCH_MONITORS_THROTTLE_MS,
          },
        )
        .pipe(
          Effect.catch((error) =>
            Effect.logError("Failed to enqueue saved-search monitors check", {
              ...buildRunLogContext(payload),
              error,
            }),
          ),
        )

      const canonicalSessionId =
        traceDetail.sessionId && traceDetail.sessionId.length > 0 ? traceDetail.sessionId : traceDetail.traceId
      const analyzeSessionWorkflowId = `org:${payload.organizationId}:conversation-intelligence:analyzeSession:${payload.projectId}:${canonicalSessionId}`
      yield* workflowStarter
        .signalWithStart(
          "analyzeSessionWorkflow",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            sessionId: canonicalSessionId,
            triggeringTraceId: payload.traceId,
            triggeringStartTime: traceDetail.startTime.toISOString(),
            reason: "trace_completed",
            debounceMs: CONVERSATION_INTELLIGENCE_ANALYSIS_DEBOUNCE_MS,
          },
          {
            workflowId: analyzeSessionWorkflowId,
            signal: "traceCompleted",
            signalArgs: [{ debounceMs: CONVERSATION_INTELLIGENCE_ANALYSIS_DEBOUNCE_MS }],
          },
        )
        .pipe(
          Effect.catch((error) =>
            Effect.logError("Failed to start conversation intelligence AnalyzeSessionWorkflow", {
              ...buildRunLogContext(payload),
              sessionId: canonicalSessionId,
              workflowId: analyzeSessionWorkflowId,
              error,
            }),
          ),
        )

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
          deterministicFlaggersEnqueued,
        },
      } satisfies TraceEndRunResult
    }).pipe(
      withPostgres(
        Layer.mergeAll(
          AnnotationQueueItemRepositoryLive,
          AnnotationQueueRepositoryLive,
          EvaluationRepositoryLive,
          OutboxEventWriterLive,
          ScoreRepositoryLive,
        ),
        postgresClient,
        OrganizationId(payload.organizationId),
      ),
      withClickHouse(
        Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive),
        clickhouseClient,
        OrganizationId(payload.organizationId),
      ),
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
            deterministicFlaggersEnqueued: result.summary.deterministicFlaggersEnqueued,
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
  postgresClient,
  clickhouseClient,
  redisClient,
  logger: injectedLogger,
  workflowStarter,
}: TraceEndDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()
  const traceEndLogger = injectedLogger ?? logger
  const temporalStarter =
    workflowStarter ??
    ({
      start: (...args) =>
        Effect.promise(() => getWorkflowStarter()).pipe(Effect.flatMap((starter) => starter.start(...args))),
      signalWithStart: (...args) =>
        Effect.promise(() => getWorkflowStarter()).pipe(Effect.flatMap((starter) => starter.signalWithStart(...args))),
    } satisfies WorkflowStarterShape)

  consumer.subscribe(TRACE_END_QUEUE, {
    run: createRunHandler({
      log: traceEndLogger,
      publisher,
      postgresClient: pgClient,
      clickhouseClient: chClient,
      redisClient: rdClient,
      workflowStarter: temporalStarter,
    }),
  })
}
