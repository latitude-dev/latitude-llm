import { generateApiKeyUseCase } from "@domain/api-keys"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { ApiKeyRepositoryLive, OutboxEventWriterLive, type PostgresClient, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("api-keys")

export const createApiKeysWorker = ({
  consumer,
  postgresClient,
}: {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
}) => {
  const pgClient = postgresClient ?? getPostgresClient()

  consumer.subscribe("api-keys", {
    create: (payload) => {
      return generateApiKeyUseCase({ name: payload.name }).pipe(
        withPostgres(
          Layer.mergeAll(ApiKeyRepositoryLive, OutboxEventWriterLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withTracing,
        Effect.tap(() => Effect.sync(() => logger.info(`API key created for organization ${payload.organizationId}`))),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Failed to create API key for organization ${payload.organizationId}`, error)),
        ),
        Effect.asVoid,
      )
    },
  })
}
