import {
  enqueueLiveEvaluationsUseCase,
  LiveEvaluationQueuePublishError,
  LiveEvaluationQueuePublisher,
  type LiveEvaluationQueuePublisherShape,
  type RunLiveEvaluationResult,
  runLiveEvaluationUseCase,
} from "@domain/evaluations"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import type { EvaluationScore } from "@domain/scores"
import { OrganizationId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import type { RedisClient } from "@platform/cache-redis"
import {
  type ClickHouseClient,
  ScoreAnalyticsRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("live-evaluations")
const LIVE_EVALUATIONS_QUEUE = "live-evaluations" as const
const LIVE_EVALUATIONS_ENQUEUE_TASK = "enqueue" as const
const LIVE_EVALUATIONS_EXECUTE_TASK = "execute" as const

interface EnqueuePayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

interface ExecutePayload {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
}

type LiveEvaluationsLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface LiveEvaluationsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
  runLiveEvaluation?: typeof runLiveEvaluationUseCase
  logger?: LiveEvaluationsLogger
}

const buildEnqueueLogContext = (payload: EnqueuePayload) => ({
  queue: LIVE_EVALUATIONS_QUEUE,
  task: LIVE_EVALUATIONS_ENQUEUE_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  traceId: payload.traceId,
})

const buildExecuteLogContext = (payload: ExecutePayload) => ({
  queue: LIVE_EVALUATIONS_QUEUE,
  task: LIVE_EVALUATIONS_EXECUTE_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  evaluationId: payload.evaluationId,
  traceId: payload.traceId,
})

const getExecuteResultKind = (score: EvaluationScore) => {
  if (score.errored) return "errored" as const
  if (score.passed) return "passed" as const
  return "failed" as const
}

const getIssueAssignmentPath = (score: EvaluationScore) => {
  if (score.issueId !== null) return "direct" as const
  if (score.errored || score.passed) return "none" as const
  return "deferred" as const
}

const buildExecuteSkippedLogContext = (result: Extract<RunLiveEvaluationResult, { readonly action: "skipped" }>) => ({
  outcome: result.action,
  resultKind: "skipped" as const,
  reason: result.reason,
})

const buildExecutePersistedLogContext = (
  result: Extract<RunLiveEvaluationResult, { readonly action: "persisted" }>,
) => ({
  outcome: result.action,
  resultKind: getExecuteResultKind(result.context.score),
  scoreId: result.summary.scoreId,
  issueAssignmentPath: getIssueAssignmentPath(result.context.score),
  tokens: result.context.score.tokens,
  cost: result.context.score.cost,
  duration: result.context.score.duration,
  ...(result.summary.sessionId !== null ? { sessionId: result.summary.sessionId } : {}),
})

// TODO(eval-sandbox): when implementing live evaluation execution, use the same extract-and-call
// approach from executeEvaluationScript for MVP, then migrate to sandboxed JS runtime.
export const createLiveEvaluationsWorker = ({
  consumer,
  publisher,
  postgresClient,
  clickhouseClient,
  redisClient,
  runLiveEvaluation,
  logger: injectedLogger,
}: LiveEvaluationsDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const liveEvaluationsLogger = injectedLogger ?? logger
  const liveEvaluationQueuePublisher = {
    publishExecute: ({ organizationId, projectId, evaluationId, traceId, dedupeKey, debounceMs }) => {
      const publishOptions =
        dedupeKey === undefined
          ? debounceMs === undefined
            ? undefined
            : { debounceMs }
          : debounceMs === undefined
            ? { dedupeKey }
            : { dedupeKey, debounceMs }

      return publisher
        .publish(
          "live-evaluations",
          "execute",
          {
            organizationId,
            projectId,
            evaluationId,
            traceId,
          },
          publishOptions,
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new LiveEvaluationQueuePublishError({
                evaluationId,
                traceId,
                cause,
              }),
          ),
        )
    },
  } satisfies LiveEvaluationQueuePublisherShape

  const withDefaultAi = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
    const rdClient = redisClient ?? getRedisClient()
    return effect.pipe(withAi(AIGenerateLive, rdClient))
  }
  const executeLiveEvaluation = runLiveEvaluation ?? runLiveEvaluationUseCase

  consumer.subscribe(LIVE_EVALUATIONS_QUEUE, {
    enqueue: (payload: EnqueuePayload) =>
      enqueueLiveEvaluationsUseCase(payload).pipe(
        withPostgres(
          Layer.mergeAll(EvaluationRepositoryLive, ScoreRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withClickHouse(TraceRepositoryLive, chClient, OrganizationId(payload.organizationId)),
        withTracing,
        Effect.provide(Layer.succeed(LiveEvaluationQueuePublisher, liveEvaluationQueuePublisher)),
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.action === "skipped") {
              liveEvaluationsLogger.info("Live evaluation enqueue skipped", {
                ...buildEnqueueLogContext(payload),
                outcome: result.action,
                reason: result.reason,
              })
              return
            }

            liveEvaluationsLogger.info("Live evaluation enqueue completed", {
              ...buildEnqueueLogContext(payload),
              outcome: result.action,
              sessionId: result.summary.sessionId,
              activeEvaluationsScanned: result.summary.activeEvaluationsScanned,
              filterMatchedCount: result.summary.filterMatchedCount,
              skippedPausedCount: result.summary.skippedPausedCount,
              skippedSamplingCount: result.summary.skippedSamplingCount,
              skippedTurnCount: result.summary.skippedTurnCount,
              publishedExecuteCount: result.summary.publishedExecuteCount,
            })
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            liveEvaluationsLogger.error("Live evaluation enqueue failed", {
              ...buildEnqueueLogContext(payload),
              outcome: "failed",
              error,
            }),
          ),
        ),
        Effect.asVoid,
      ),
    execute: (payload: ExecutePayload) =>
      executeLiveEvaluation(payload).pipe(
        withPostgres(
          Layer.mergeAll(EvaluationRepositoryLive, IssueRepositoryLive, OutboxEventWriterLive, ScoreRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withClickHouse(
          Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive),
          chClient,
          OrganizationId(payload.organizationId),
        ),
        withDefaultAi,
        withTracing,
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.action === "skipped") {
              liveEvaluationsLogger.info("Live evaluation execute skipped", {
                ...buildExecuteLogContext(payload),
                ...buildExecuteSkippedLogContext(result),
              })
              return
            }

            liveEvaluationsLogger.info("Live evaluation execute completed", {
              ...buildExecuteLogContext(payload),
              ...buildExecutePersistedLogContext(result),
            })
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            liveEvaluationsLogger.error("Live evaluation execute failed", {
              ...buildExecuteLogContext(payload),
              outcome: "failed",
              error,
            }),
          ),
        ),
        Effect.asVoid,
      ),
  })
}
