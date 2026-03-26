import type { QueueConsumer } from "@domain/queue"
import { saveScoreAnalyticsUseCase } from "@domain/scores"
import { OrganizationId } from "@domain/shared"
import { type ClickHouseClient, ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { type PostgresClient, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("scores")

export const createScoresWorker = ({
  consumer,
  clickhouseClient,
  postgresClient,
  logger: customLogger,
}: {
  consumer: QueueConsumer
  clickhouseClient?: ClickHouseClient
  postgresClient?: PostgresClient
  logger?: Pick<typeof logger, "error" | "info">
}) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const pgClient = postgresClient ?? getPostgresClient()
  const workerLogger = customLogger ?? logger

  consumer.subscribe("analytic-scores", {
    save: (payload) =>
      saveScoreAnalyticsUseCase({ scoreId: payload.scoreId }).pipe(
        withPostgres(ScoreRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, OrganizationId(payload.organizationId)),
        Effect.tap(() =>
          Effect.sync(() => workerLogger.info(`Saved score analytics for ${payload.projectId}/${payload.scoreId}`)),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            workerLogger.error(`Score analytics save failed for ${payload.projectId}/${payload.scoreId}`, error),
          ),
        ),
        Effect.asVoid,
      ),
  })
}
