import { publishAnnotationUseCase } from "@domain/annotations"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, type ScoreId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import type { RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
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
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
}

export const createAnnotationScoresWorker = ({
  consumer,
  postgresClient,
  clickhouseClient,
  redisClient,
}: AnnotationScoresDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()

  consumer.subscribe("annotation-scores", {
    publish: (payload) =>
      publishAnnotationUseCase({ scoreId: payload.scoreId as ScoreId }).pipe(
        withPostgres(
          Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withClickHouse(
          Layer.mergeAll(TraceRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
          chClient,
          OrganizationId(payload.organizationId),
        ),
        withAi(AIGenerateLive, rdClient),
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
