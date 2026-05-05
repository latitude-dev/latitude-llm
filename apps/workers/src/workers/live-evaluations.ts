import { meterBillableAction } from "@domain/billing"
import { type RunLiveEvaluationResult, runLiveEvaluationUseCase } from "@domain/evaluations"
import { type QueueConsumer, QueuePublisher, type QueuePublisherShape } from "@domain/queue"
import type { EvaluationScore } from "@domain/scores"
import { OrganizationId, ProjectId } from "@domain/shared"
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
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ScoreRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("live-evaluations")
const LIVE_EVALUATIONS_QUEUE = "live-evaluations" as const
const LIVE_EVALUATIONS_EXECUTE_TASK = "execute" as const

interface ExecutePayload {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
}

type LiveEvaluationsLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface LiveEvaluationsDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
  publisher?: QueuePublisherShape
  runLiveEvaluation?: typeof runLiveEvaluationUseCase
  logger?: LiveEvaluationsLogger
}

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
  postgresClient,
  clickhouseClient,
  redisClient,
  publisher,
  runLiveEvaluation,
  logger: injectedLogger,
}: LiveEvaluationsDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const liveEvaluationsLogger = injectedLogger ?? logger
  const withDefaultAi = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
    const rdClient = redisClient ?? getRedisClient()
    return effect.pipe(withAi(AIGenerateLive, rdClient))
  }
  const executeLiveEvaluation = runLiveEvaluation ?? runLiveEvaluationUseCase
  const executeEffect = (payload: ExecutePayload) => {
    const baseEffect = executeLiveEvaluation(payload, {
      beforeExecute: ({ organizationId, projectId, evaluationId, traceId }) =>
        meterBillableAction({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(projectId),
          action: "live-eval-scan",
          idempotencyKey: `live-eval-scan:${organizationId}:${evaluationId}:${traceId}`,
          skipIfBlocked: true,
          metadata: {
            evaluationId,
            traceId,
          },
        }).pipe(Effect.map((result) => result.allowed)),
    }).pipe(
      withPostgres(
        Layer.mergeAll(
          EvaluationRepositoryLive,
          IssueRepositoryLive,
          OutboxEventWriterLive,
          ScoreRepositoryLive,
          BillingOverrideRepositoryLive,
          BillingUsageEventRepositoryLive,
          BillingUsagePeriodRepositoryLive,
          SettingsReaderLive,
          StripeSubscriptionLookupLive,
        ),
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
    )

    return publisher ? baseEffect.pipe(Effect.provideService(QueuePublisher, publisher)) : baseEffect
  }

  consumer.subscribe(LIVE_EVALUATIONS_QUEUE, {
    execute: executeEffect,
  })
}
