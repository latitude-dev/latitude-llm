import { publishAnnotationUseCase } from "@domain/annotations"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, type ScoreId } from "@domain/shared"
import { AICredentialsLive } from "@platform/ai-credentials"
import { AIGenerateLive } from "@platform/ai-vercel"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  ScoreAnalyticsRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import { OutboxEventWriterLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("annotation-scores")

interface AnnotationScoresDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
}

export const createAnnotationScoresWorker = ({ consumer, postgresClient }: AnnotationScoresDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const annotationAiLayer = AIGenerateLive.pipe(
    Layer.provideMerge(AICredentialsLive),
    Layer.provideMerge(RedisCacheStoreLive(getRedisClient())),
  )

  const postgresLayers = Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive)

  consumer.subscribe("annotation-scores", {
    publish: (payload) =>
      publishAnnotationUseCase({ scoreId: payload.scoreId as ScoreId }).pipe(
        withPostgres(postgresLayers, pgClient, OrganizationId(payload.organizationId)),
        withClickHouse(
          Layer.mergeAll(TraceRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
          getClickhouseClient(),
          OrganizationId(payload.organizationId),
        ),
        Effect.provide(annotationAiLayer),
        Effect.tap(() =>
          Effect.sync(() => logger.info(`Published annotation score ${payload.projectId}/${payload.scoreId}`)),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`Annotation publication failed for ${payload.projectId}/${payload.scoreId}`, error),
          ),
        ),
        Effect.asVoid,
      ),
  })
}
