import type { QueueConsumer } from "@domain/queue"
import { saveScoreAnalyticsUseCase } from "@domain/scores"
import { OrganizationId } from "@domain/shared"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("scores")

interface ScoresWorkerDependencies {
  readonly clickhouseClient?: ReturnType<typeof getClickhouseClient>
  readonly postgresClient?: ReturnType<typeof getPostgresClient>
  readonly logger?: Pick<typeof logger, "error" | "info">
}

export const createScoresWorker = (consumer: QueueConsumer, deps: ScoresWorkerDependencies = {}) => {
  const chClient = deps.clickhouseClient ?? getClickhouseClient()
  const pgClient = deps.postgresClient ?? getPostgresClient()
  const workerLogger = deps.logger ?? logger

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
