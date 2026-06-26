import {
  checkMonitorsUseCase,
  deleteMonitorUseCase,
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
  SavedSearchRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Cause, Effect, Layer } from "effect"
import { getAdminPostgresClient, getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("monitors")

interface MonitorsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  postgresClient?: PostgresClient
  adminPostgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
}

const monitorWorkerRepoLayer = Layer.mergeAll(
  MonitorRepositoryLive,
  IncidentRepositoryLive,
  OutboxEventWriterLive,
  SavedSearchRepositoryLive,
)
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
        withPostgres(monitorWorkerRepoLayer, pgClient, OrganizationId(payload.organizationId)),
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
      Effect.gen(function* () {
        if (payload.sourceType !== "savedSearch") return { deleted: 0, failed: 0 }
        const repository = yield* MonitorRepository
        const monitors = yield* repository.listActiveMonitors({
          projectId: ProjectId(payload.projectId),
          targetType: "savedSearch",
        })
        const matching = monitors.filter((monitor) => monitor.target.id === payload.sourceId)
        const outcomes = yield* Effect.forEach(
          matching,
          (monitor) =>
            deleteMonitorUseCase({ id: monitor.id }).pipe(
              Effect.as("deleted" as const),
              Effect.catchCause((cause) =>
                Effect.sync(() => {
                  logger.error(`Source cascade failed to delete monitor ${monitor.id}`, Cause.squash(cause))
                  return "failed" as const
                }),
              ),
            ),
          { concurrency: 4 },
        )
        const result = {
          deleted: outcomes.filter((outcome) => outcome === "deleted").length,
          failed: outcomes.filter((outcome) => outcome === "failed").length,
        }
        if (result.failed > 0) {
          return yield* Effect.fail(new Error(`Failed to delete ${result.failed} saved-search monitor(s)`))
        }
        return result
      }).pipe(
        withPostgres(monitorWorkerRepoLayer, pgClient, OrganizationId(payload.organizationId)),
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              `Source cascade for ${payload.sourceType}:${payload.sourceId}: deleted=${result.deleted} failed=${result.failed}`,
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
