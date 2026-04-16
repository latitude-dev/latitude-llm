import {
  draftSystemQueueAnnotationUseCase,
  persistSystemQueueAnnotationUseCase,
  type RunSystemQueueFlaggerResult,
  runSystemQueueFlaggerUseCase,
  type SystemQueueAnnotateOutput,
} from "@domain/annotation-queues"
import { OrganizationId } from "@domain/shared"
import type { TraceResourceOutlierReason } from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import {
  ScoreAnalyticsRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  AnnotationQueueItemRepositoryLive,
  AnnotationQueueRepositoryLive,
  OutboxEventWriterLive,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("workflows-flagger")
const systemQueueLogger = createLogger("workflows-system-queue-flagger")

export const runFlagger = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}): Promise<RunSystemQueueFlaggerResult> =>
  Effect.runPromise(
    runSystemQueueFlaggerUseCase(input).pipe(
      withClickHouse(TraceRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      withAi(AIGenerateLive, getRedisClient()),
      withTracing,
      Effect.tap(() =>
        Effect.sync(() =>
          logger.info("Ran system queue flagger", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            queueSlug: input.queueSlug,
          }),
        ),
      ),
    ),
  )

interface DraftAnnotateOutput {
  readonly queueId: string
  readonly traceId: string
  readonly feedback: string
  readonly traceCreatedAt: string
}

export const draftAnnotate = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
  readonly matchReasons?: readonly TraceResourceOutlierReason[]
}): Promise<DraftAnnotateOutput> =>
  Effect.runPromise(
    draftSystemQueueAnnotationUseCase({
      ...input,
      ...(input.matchReasons ? { matchReasons: [...input.matchReasons] } : {}),
    }).pipe(
      withPostgres(AnnotationQueueRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withClickHouse(
        Layer.mergeAll(TraceRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(AIGenerateLive, getRedisClient()),
      withTracing,
      Effect.tapError((error) =>
        Effect.sync(() => {
          systemQueueLogger.error("System queue draft annotate activity failed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            queueSlug: input.queueSlug,
            error,
          })
        }),
      ),
    ),
  )

export const persistAnnotation = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
  readonly queueId: string
  readonly feedback: string
  readonly traceCreatedAt: string
}): Promise<SystemQueueAnnotateOutput> =>
  Effect.runPromise(
    persistSystemQueueAnnotationUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(
          ScoreRepositoryLive,
          AnnotationQueueRepositoryLive,
          AnnotationQueueItemRepositoryLive,
          OutboxEventWriterLive,
        ),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(
        Layer.mergeAll(TraceRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withTracing,
      Effect.tapError((error) =>
        Effect.sync(() => {
          systemQueueLogger.error("System queue persist annotation activity failed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            queueSlug: input.queueSlug,
            queueId: input.queueId,
            error,
          })
        }),
      ),
    ),
  )
