import {
  AMBIGUOUS_FLAGGER_DEFAULT_RATE_LIMIT,
  type CheckAmbiguousRateLimit,
  type EnqueueFlaggerWorkflowStart,
  processDeterministicFlaggersUseCase,
} from "@domain/annotation-queues"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { checkRedisRateLimit, RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import {
  type ClickHouseClient,
  ScoreAnalyticsRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  AnnotationQueueRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("deterministic-flaggers")
const QUEUE = "deterministic-flaggers" as const
const RUN_TASK = "run" as const

interface RunPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

type DeterministicFlaggersLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface DeterministicFlaggersDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
  logger?: DeterministicFlaggersLogger
}

const buildLogContext = (payload: RunPayload) => ({
  queue: QUEUE,
  task: RUN_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  traceId: payload.traceId,
})

const rateLimitKey = (organizationId: string, queueSlug: string) =>
  `org:${organizationId}:ratelimit:flagger-ambiguous:${queueSlug}`

const makeRateLimitChecker =
  (redisClient: RedisClient): CheckAmbiguousRateLimit =>
  ({ organizationId, queueSlug }) =>
    checkRedisRateLimit(redisClient, {
      key: rateLimitKey(organizationId, queueSlug),
      maxRequests: AMBIGUOUS_FLAGGER_DEFAULT_RATE_LIMIT.maxRequests,
      windowSeconds: AMBIGUOUS_FLAGGER_DEFAULT_RATE_LIMIT.windowSeconds,
    }).pipe(Effect.map((result) => result.allowed))

const makeEnqueueWorkflowStart =
  (publisher: QueuePublisherShape): EnqueueFlaggerWorkflowStart =>
  (args) =>
    publisher
      .publish(
        "start-flagger-workflow",
        "start",
        {
          organizationId: args.organizationId,
          projectId: args.projectId,
          traceId: args.traceId,
          queueSlug: args.queueSlug,
          reason: args.reason,
        },
        {
          dedupeKey: `flagger-start:${args.traceId}:${args.queueSlug}`,
          // Bounded exponential retry at the BullMQ layer absorbs short Temporal
          // outages. Delays: 2s, 4s, 8s — total ~14s before the job fails.
          attempts: 4,
          backoff: { type: "exponential", delayMs: 2000 },
        },
      )
      .pipe(
        Effect.catch((error) =>
          Effect.logError("Failed to enqueue start-flagger-workflow", {
            error,
            organizationId: args.organizationId,
            traceId: args.traceId,
            queueSlug: args.queueSlug,
            reason: args.reason,
          }),
        ),
      )

export const createDeterministicFlaggersWorker = ({
  consumer,
  publisher,
  postgresClient,
  clickhouseClient,
  redisClient,
  logger: injectedLogger,
}: DeterministicFlaggersDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()
  const log = injectedLogger ?? logger

  const deps = {
    enqueueWorkflowStart: makeEnqueueWorkflowStart(publisher),
    checkAmbiguousRateLimit: makeRateLimitChecker(rdClient),
  }

  consumer.subscribe(QUEUE, {
    run: (payload: RunPayload) =>
      processDeterministicFlaggersUseCase(payload, deps).pipe(
        withPostgres(
          Layer.mergeAll(AnnotationQueueRepositoryLive, OutboxEventWriterLive, ScoreRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withClickHouse(
          Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive),
          chClient,
          OrganizationId(payload.organizationId),
        ),
        Effect.provide(RedisCacheStoreLive(rdClient)),
        withTracing,
        Effect.tap((result) =>
          Effect.sync(() => {
            const counts = summarizeDecisions(result.decisions)
            log.info("Deterministic flaggers completed", {
              ...buildLogContext(payload),
              ...counts,
            })
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            log.error("Deterministic flaggers failed", {
              ...buildLogContext(payload),
              error,
            }),
          ),
        ),
        Effect.asVoid,
      ),
  })
}

const summarizeDecisions = (decisions: ReadonlyArray<{ readonly action: string }>) => {
  const counts: Record<string, number> = {
    matched: 0,
    enqueued: 0,
    dropped: 0,
    failed: 0,
  }
  for (const decision of decisions) {
    const key = decision.action === "matched-issue" ? "matched" : decision.action
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
