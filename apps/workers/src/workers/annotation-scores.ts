import { publishAnnotationUseCase } from "@domain/annotations"
import type { QueueConsumer } from "@domain/queue"
import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { OrganizationId, type ScoreId } from "@domain/shared"
import type { PostgresClient } from "@platform/db-postgres"
import { ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("annotation-scores")

interface AnnotationScoresDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
  postgresClient?: PostgresClient
}

export const createAnnotationScoresWorker = ({ consumer, workflowStarter, postgresClient }: AnnotationScoresDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()

  consumer.subscribe("annotation-scores", {
    publish: (payload) =>
      publishAnnotationUseCase({ scoreId: payload.scoreId as ScoreId }).pipe(
        withPostgres(ScoreRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
        Effect.provide(Layer.succeed(WorkflowStarter, workflowStarter)),
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.action === "workflow-started") {
              logger.info(`Started annotation publication workflow for ${payload.projectId}/${payload.scoreId}`)
            } else {
              logger.info(`Annotation score ${payload.projectId}/${payload.scoreId} already published (idempotent)`)
            }
          }),
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
