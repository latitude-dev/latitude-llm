import type { QueueConsumer } from "@domain/queue"
import { deleteScoreAnalyticsUseCase } from "@domain/scores"
import { OrganizationId, ScoreId } from "@domain/shared"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getClickhouseClient } from "../clients.ts"

const logger = createLogger("scores")

interface ScoresWorkerDeps {
  consumer: QueueConsumer
  clickhouseClient?: ClickHouseClient
}

export const createScoresWorker = ({ consumer, clickhouseClient }: ScoresWorkerDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()

  consumer.subscribe("scores", {
    "delete-analytics": (payload) =>
      deleteScoreAnalyticsUseCase({ scoreId: ScoreId(payload.scoreId) }).pipe(
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, OrganizationId(payload.organizationId)),
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.action === "deleted") {
              logger.info(`Deleted score analytics for ${payload.scoreId}`)
            }
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Failed to delete score analytics for ${payload.scoreId}`, error)),
        ),
        Effect.asVoid,
      ),
  })
}
