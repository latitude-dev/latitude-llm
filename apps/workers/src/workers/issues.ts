import {
  checkIssueEscalationUseCase,
  discoverIssueUseCase,
  ESCALATION_RECHECK_DELAY_MS,
  refreshIssueDetailsUseCase,
  removeScoreFromIssueUseCase,
} from "@domain/issues"
import {
  type QueueConsumer,
  QueuePublisher,
  type QueuePublisherShape,
  WorkflowStarter,
  type WorkflowStarterShape,
} from "@domain/queue"
import type { ScoreSource } from "@domain/scores"
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
import { createLogger, withTracing } from "@repo/observability"
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
      discoverIssueUseCase(payload).pipe(
        Effect.tap((outcome) =>
          Effect.sync(() => {
            const detail =
              outcome.action === "workflow-started" ? `${outcome.action}:${outcome.workflow}` : outcome.action
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
        withTracing,
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
        withTracing,
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
    // Reify the (otherwise read-time-derived) escalating state on the issue
    // and emit transition events. While the issue is currently escalating,
    // schedule a delayed self-recheck so escalation EXITS still get detected
    // when scoring activity stops (no more push triggers, recent count
    // organically drops below the exit threshold).
    checkEscalation: (payload) =>
      checkIssueEscalationUseCase(payload).pipe(
        withPostgres(
          Layer.mergeAll(IssueRepositoryLive, OutboxEventWriterLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, OrganizationId(payload.organizationId)),
        // While the issue is currently escalating, schedule a self-recheck.
        // `throttleMs` here is used as a "fire after N" delay (semantics: first
        // publish on a fresh dedupeKey schedules for now+throttleMs, subsequent
        // publishes within the window are dropped). Recurses naturally: each
        // run that lands "still escalating" re-arms a fresh recheck.
        Effect.tap((result) =>
          result.currentlyEscalating
            ? publisher.publish("issues", "checkEscalation", payload, {
                dedupeKey: `issues:check-escalation-recheck:${payload.issueId}`,
                throttleMs: ESCALATION_RECHECK_DELAY_MS,
              })
            : Effect.void,
        ),
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              `Escalation check for ${payload.projectId}/${payload.issueId}: transition=${result.transition} currentlyEscalating=${result.currentlyEscalating}`,
            ),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Escalation check failed for ${payload.projectId}/${payload.issueId}`, error)),
        ),
        withTracing,
        Effect.asVoid,
      ),
    removeScore: (payload) =>
      removeScoreFromIssueUseCase({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        issueId: payload.issueId,
        draftedAt: payload.draftedAt ? new Date(payload.draftedAt) : null,
        feedback: payload.feedback,
        source: payload.source as ScoreSource,
        createdAt: new Date(payload.createdAt),
      }).pipe(
        withPostgres(IssueRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
        withWeaviate(IssueProjectionRepositoryLive, wvClient, OrganizationId(payload.organizationId)),
        withAi(AIEmbedLive, rdClient),
        withTracing,
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.action === "removed") {
              logger.info(`Removed score contribution from issue centroid for ${payload.projectId}/${payload.issueId}`)
            } else if (result.action === "issue-not-found") {
              logger.info(`Issue ${payload.issueId} not found when removing score contribution`)
            }
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`Failed to remove score from issue ${payload.projectId}/${payload.issueId}`, error),
          ),
        ),
        Effect.asVoid,
      ),
  })
}
