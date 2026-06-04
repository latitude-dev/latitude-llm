import { hasFeatureFlagUseCase } from "@domain/feature-flags"
import {
  cascadeSourceDeletionUseCase,
  checkSavedSearchMonitorsUseCase,
  sweepSavedSearchMonitorsUseCase,
} from "@domain/monitors"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import type { RedisClient } from "@platform/cache-redis"
import { type ClickHouseClient, SavedSearchMatchReaderLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AlertIncidentRepositoryLive,
  FeatureFlagRepositoryLive,
  MonitorRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  SavedSearchRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("monitors")

interface MonitorsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  postgresClient?: PostgresClient
  /** Admin client — the cross-org sweep reads `monitor_alerts` regardless of org (RLS bypass). */
  adminPostgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
}

// Feature flag + saved-search resolution + incident writes all live on Postgres;
// the firing scan reads counts from ClickHouse (provided per-handler below).
const checkRepoLayer = Layer.mergeAll(
  MonitorRepositoryLive,
  AlertIncidentRepositoryLive,
  OutboxEventWriterLive,
  SavedSearchRepositoryLive,
  FeatureFlagRepositoryLive,
)

export const createMonitorsWorker = ({
  consumer,
  publisher,
  postgresClient,
  adminPostgresClient,
  clickhouseClient,
  redisClient,
}: MonitorsDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const adminPgClient = adminPostgresClient ?? getAdminPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()

  consumer.subscribe("monitors", {
    // Firing only runs for flag-on orgs (belt-and-suspenders — flag-off orgs can't create these monitors).
    checkSavedSearchMonitors: (payload) =>
      Effect.gen(function* () {
        const enabled = yield* hasFeatureFlagUseCase({ identifier: "monitors" })
        if (!enabled) return { evaluated: 0, failed: 0 }
        return yield* checkSavedSearchMonitorsUseCase(payload)
      }).pipe(
        withPostgres(checkRepoLayer, pgClient, OrganizationId(payload.organizationId)),
        withClickHouse(SavedSearchMatchReaderLive, chClient, OrganizationId(payload.organizationId)),
        withAi(AIEmbedLive, rdClient),
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              `Saved-search check for ${payload.projectId}: evaluated=${result.evaluated} failed=${result.failed}`,
            ),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Saved-search check failed for ${payload.projectId}`, error)),
        ),
        withTracing,
        Effect.asVoid,
      ),
    sweepSavedSearchMonitors: () =>
      sweepSavedSearchMonitorsUseCase({
        publish: (target) =>
          publisher.publish("monitors", "checkSavedSearchMonitors", target, {
            dedupeKey: `monitors:check-saved-search-sweep:${target.organizationId}:${target.projectId}`,
          }),
      }).pipe(
        withPostgres(MonitorRepositoryLive, adminPgClient),
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              `Saved-search sweep: published=${result.published} failed=${result.failed} attempted=${result.attempted}`,
            ),
          ),
        ),
        Effect.tapError((error) => Effect.sync(() => logger.error("Saved-search sweep failed", error))),
        withTracing,
        Effect.asVoid,
      ),
    onSourceDeleted: (payload) =>
      cascadeSourceDeletionUseCase({ sourceType: payload.sourceType, sourceId: payload.sourceId }).pipe(
        withPostgres(MonitorRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              `Source cascade ${payload.sourceType}:${payload.sourceId}: alerts=${result.deletedAlertCount} monitors=${result.deletedMonitorCount}`,
            ),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Source cascade failed for ${payload.sourceType}:${payload.sourceId}`, error)),
        ),
        withTracing,
        Effect.asVoid,
      ),
  })
}
