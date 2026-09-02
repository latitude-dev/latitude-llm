import { teardownOrganizationUseCase } from "@domain/organizations"
import type { QueueConsumer } from "@domain/queue"
import { deleteUserUseCase } from "@domain/users"
import { ApiKeyCacheInvalidatorLive } from "@platform/api-key-auth"
import {
  ApiKeyRepositoryLive,
  MembershipRepositoryLive,
  OAuthKeyRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { OAuthTokenCacheInvalidatorLive } from "@platform/oauth-token-auth"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getRedisClient } from "../../clients.ts"

const logger = createLogger("user-deletion")

interface UserDeletionDeps {
  consumer: QueueConsumer
}

export const createUserDeletionWorker = ({ consumer }: UserDeletionDeps) => {
  consumer.subscribe("user-deletion", {
    delete: (payload) => {
      const pgClient = getAdminPostgresClient()
      const redis = getRedisClient()
      const repoLayer = Layer.mergeAll(MembershipRepositoryLive, OrganizationRepositoryLive, UserRepositoryLive)
      const teardownLayer = Layer.mergeAll(
        ProjectRepositoryLive,
        OutboxEventWriterLive,
        ApiKeyRepositoryLive,
        OAuthKeyRepositoryLive,
      )

      return Effect.gen(function* () {
        const { deletedOrganizationIds } = yield* deleteUserUseCase({ userId: payload.userId }).pipe(
          withPostgres(repoLayer, pgClient),
        )

        // Projects and API keys have no FK to the org, so each sole-member org we deleted
        // is torn down explicitly, scoped per org so the SqlClient context matches.
        for (const organizationId of deletedOrganizationIds) {
          yield* teardownOrganizationUseCase({ actorUserId: payload.userId }).pipe(
            Effect.provide(ApiKeyCacheInvalidatorLive(redis)),
            Effect.provide(OAuthTokenCacheInvalidatorLive(redis)),
            withPostgres(teardownLayer, pgClient, organizationId),
          )
        }
      }).pipe(
        withTracing,
        Effect.tap(() => Effect.sync(() => logger.info(`User ${payload.userId} permanently deleted`))),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`User deletion failed for ${payload.userId}`, error)),
        ),
        Effect.asVoid,
      )
    },
  })
}
