import { generateApiKeyUseCase } from "@domain/api-keys"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { ApiKeyRepositoryLive, type PostgresClient, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("api-keys")

interface ApiKeysWorkerDeps {
  readonly postgresClient: PostgresClient
}

export const createApiKeysWorker = (consumer: QueueConsumer, deps?: Partial<ApiKeysWorkerDeps>) => {
  const pgClient = deps?.postgresClient ?? getPostgresClient()

  consumer.subscribe("api-keys", {
    create: (payload) => {
      return generateApiKeyUseCase({ name: payload.name }).pipe(
        withPostgres(ApiKeyRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
        Effect.tap(() => Effect.sync(() => logger.info(`API key created for organization ${payload.organizationId}`))),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Failed to create API key for organization ${payload.organizationId}`, error)),
        ),
        Effect.asVoid,
      )
    },
  })
}
