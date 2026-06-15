import { deleteProjectDestinationsUseCase } from "@domain/destinations"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { DestinationRepositoryLive, DestinationSyncRunRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("destinations")

interface DestinationsDeps {
  consumer: QueueConsumer
}

const deleteByProjectLayer = Layer.mergeAll(DestinationRepositoryLive, DestinationSyncRunRepositoryLive)

export const createDestinationsWorker = ({ consumer }: DestinationsDeps) => {
  const pgClient = getPostgresClient()

  consumer.subscribe("destinations", {
    "delete-by-project": (payload) =>
      deleteProjectDestinationsUseCase({
        organizationId: OrganizationId(payload.organizationId),
        projectId: ProjectId(payload.projectId),
      }).pipe(
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(`destinations.delete-by-project projectId=${payload.projectId} deleted=${result.deleted}`),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`destinations.delete-by-project failed projectId=${payload.projectId}`, error),
          ),
        ),
        withPostgres(deleteByProjectLayer, pgClient, OrganizationId(payload.organizationId)),
        Effect.asVoid,
        withTracing,
      ),
  })
}
