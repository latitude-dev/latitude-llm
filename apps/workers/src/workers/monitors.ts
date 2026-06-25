import {
  checkMonitorsUseCase,
  MonitorRepository,
  SAVED_SEARCH_MONITORS_THROTTLE_MS,
  savedSearchMonitorsCheckDedupeKey,
} from "@domain/monitors"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { type ClickHouseClient, MetricSeriesReaderLive, withClickHouse } from "@platform/db-clickhouse"
import {
  IncidentRepositoryLive,
  MonitorRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("monitors")

interface MonitorsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  postgresClient?: PostgresClient
  adminPostgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
}

const checkRepoLayer = Layer.mergeAll(MonitorRepositoryLive, IncidentRepositoryLive, OutboxEventWriterLive)

export const createMonitorsWorker = ({
  consumer,
  publisher,
  postgresClient,
  adminPostgresClient,
  clickhouseClient,
}: MonitorsDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const adminPgClient = adminPostgresClient ?? getAdminPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()

  consumer.subscribe("monitors", {
    checkSavedSearchMonitors: (payload) =>
      checkMonitorsUseCase({ projectId: ProjectId(payload.projectId) }).pipe(
        withPostgres(checkRepoLayer, pgClient, OrganizationId(payload.organizationId)),
        withClickHouse(MetricSeriesReaderLive, chClient, OrganizationId(payload.organizationId)),
        Effect.tap((result) =>
          Effect.sync(() => logger.info(`Monitor check for ${payload.projectId}: checked=${result.checked}`)),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Monitor check failed for ${payload.projectId}`, error)),
        ),
        withTracing,
        Effect.asVoid,
      ),
    sweepSavedSearchMonitors: () =>
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const projects = yield* repository.listProjectsWithActiveMonitors()
        yield* Effect.forEach(
          projects,
          ({ organizationId, projectId }) =>
            publisher.publish(
              "monitors",
              "checkSavedSearchMonitors",
              { organizationId, projectId },
              {
                dedupeKey: savedSearchMonitorsCheckDedupeKey({ organizationId, projectId }),
                throttleMs: SAVED_SEARCH_MONITORS_THROTTLE_MS,
              },
            ),
          { concurrency: 8 },
        )
        return { published: projects.length }
      }).pipe(
        withPostgres(MonitorRepositoryLive, adminPgClient),
        Effect.tap((result) => Effect.sync(() => logger.info(`Monitor sweep: published=${result.published}`))),
        Effect.tapError((error) => Effect.sync(() => logger.error("Monitor sweep failed", error))),
        withTracing,
        Effect.asVoid,
      ),
    onSourceDeleted: (payload) =>
      Effect.sync(() =>
        logger.info(`Source cascade skipped for ${payload.sourceType}:${payload.sourceId}; monitor targets are inline`),
      ),
  })
}
