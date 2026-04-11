import { maybeDiscoverIssueUseCase, refreshIssueDetailsUseCase } from "@domain/issues"
import {
  type QueueConsumer,
  QueuePublisher,
  type QueuePublisherShape,
  WorkflowStarter,
  type WorkflowStarterShape,
} from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive } from "@platform/ai-voyage"
import type { RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { IssueProjectionRepositoryLive, type WeaviateClient, withWeaviate } from "@platform/db-weaviate"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient, getWeaviateClient } from "../clients.ts"

const logger = createLogger("issues")

interface IssuesDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  workflowStarter: WorkflowStarterShape
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  weaviateClient?: WeaviateClient
  redisClient?: RedisClient
}

export const createIssuesWorker = async ({
  consumer,
  publisher,
  workflowStarter,
  postgresClient,
  clickhouseClient,
  weaviateClient,
  redisClient,
}: IssuesDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const wvClient = weaviateClient ?? (await getWeaviateClient())
  const rdClient = redisClient ?? getRedisClient()

  consumer.subscribe("issues", {
    discovery: (payload) =>
      maybeDiscoverIssueUseCase(payload).pipe(
        Effect.tap((outcome) =>
          outcome.skipped
            ? Effect.void
            : Effect.sync(() => {
                const detail =
                  outcome.result.action === "workflow-started"
                    ? `${outcome.result.action}:${outcome.result.workflow}`
                    : outcome.result.action
                logger.info(`Processed issue discovery for ${payload.projectId}/${payload.scoreId} (${detail})`)
              }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Issue discovery failed for ${payload.projectId}/${payload.scoreId}`, error)),
        ),
        withPostgres(
          Layer.mergeAll(EvaluationRepositoryLive, IssueRepositoryLive, OutboxEventWriterLive, ScoreRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, OrganizationId(payload.organizationId)),
        withWeaviate(IssueProjectionRepositoryLive, wvClient, OrganizationId(payload.organizationId)),
        withAi(AIEmbedLive, rdClient),
        Effect.provide(Layer.succeed(WorkflowStarter, workflowStarter)),
        Effect.asVoid,
      ),
    refresh: (payload) =>
      refreshIssueDetailsUseCase(payload).pipe(
        withPostgres(
          Layer.mergeAll(EvaluationRepositoryLive, IssueRepositoryLive, ScoreRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withWeaviate(IssueProjectionRepositoryLive, wvClient, OrganizationId(payload.organizationId)),
        withAi(AIGenerateLive, rdClient),
        Effect.provide(Layer.succeed(QueuePublisher, publisher)),
        Effect.tap(() =>
          Effect.sync(() =>
            logger.info(`Refreshed issue details and projection for ${payload.projectId}/${payload.issueId}`),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Issue refresh failed for ${payload.projectId}/${payload.issueId}`, error)),
        ),
        Effect.asVoid,
      ),
  })
}
