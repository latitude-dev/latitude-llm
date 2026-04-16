import { markReviewStartedUseCase } from "@domain/annotation-queues"
import { publishHumanAnnotationUseCase } from "@domain/annotations"
import type { QueueConsumer } from "@domain/queue"
import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { ScoreRepository } from "@domain/scores"
import { OrganizationId, type ScoreId } from "@domain/shared"
import type { PostgresClient } from "@platform/db-postgres"
import { AnnotationQueueItemRepositoryLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
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
    publishHumanAnnotation: (payload) =>
      publishHumanAnnotationUseCase({ scoreId: payload.scoreId as ScoreId }).pipe(
        withPostgres(ScoreRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
        withTracing,
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

    markReviewStarted: (payload) =>
      Effect.gen(function* () {
        const scoreRepo = yield* ScoreRepository
        const score = yield* scoreRepo.findById(payload.scoreId as ScoreId)

        const count = yield* markReviewStartedUseCase({ score })

        if (count > 0) {
          logger.info(`Marked ${count} queue item(s) as in-progress for trace ${score.traceId}`)
        }
      }).pipe(
        withPostgres(
          Layer.mergeAll(ScoreRepositoryLive, AnnotationQueueItemRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withTracing,
        Effect.catchTag("NotFoundError", () =>
          Effect.sync(() => logger.warn(`Score ${payload.scoreId} not found, skipping markReviewStarted`)),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`markReviewStarted failed for score ${payload.scoreId}`, error)),
        ),
        Effect.asVoid,
      ),
  })
}
