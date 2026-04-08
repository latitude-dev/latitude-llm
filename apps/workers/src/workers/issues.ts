import { refreshIssueDetailsUseCase } from "@domain/issues"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import type { RedisClient } from "@platform/cache-redis"
import { IssueRepositoryLive, type PostgresClient, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { IssueProjectionRepositoryLive, type WeaviateClient, withWeaviate } from "@platform/db-weaviate"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient, getRedisClient, getWeaviateClient } from "../clients.ts"

const logger = createLogger("issues")

interface IssuesDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
  weaviateClient?: WeaviateClient
  redisClient?: RedisClient
}

export const createIssuesWorker = async ({ consumer, postgresClient, weaviateClient, redisClient }: IssuesDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const wvClient = weaviateClient ?? (await getWeaviateClient())
  const rdClient = redisClient ?? getRedisClient()

  consumer.subscribe("issues", {
    refresh: (payload) =>
      refreshIssueDetailsUseCase(payload).pipe(
        withPostgres(
          Layer.mergeAll(IssueRepositoryLive, ScoreRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withWeaviate(IssueProjectionRepositoryLive, wvClient, OrganizationId(payload.organizationId)),
        withAi(AIGenerateLive, rdClient),
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
