import { OrganizationRepository, teardownOrganizationUseCase } from "@domain/organizations"
import type { QueueConsumer } from "@domain/queue"
import { ApiKeyCacheInvalidatorLive } from "@platform/api-key-auth"
import {
  ApiKeyRepositoryLive,
  OAuthKeyRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { OAuthTokenCacheInvalidatorLive } from "@platform/oauth-token-auth"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("organization-cleanup")

interface OrganizationCleanupDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
}

const teardownLayers = Layer.mergeAll(
  ProjectRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  ApiKeyRepositoryLive,
  OAuthKeyRepositoryLive,
)

// Reaps temporary orgs past their claim deadline: per org, tear it down (revoke API/OAuth keys, purge projects)
// then hard-delete the org (FK-cascades members/invitations/OAuth). Per-org so one failure never aborts the batch.
export const createOrganizationCleanupWorker = ({ consumer, postgresClient }: OrganizationCleanupDeps) => {
  const adminClient = postgresClient ?? getAdminPostgresClient()
  const redis = getRedisClient()

  consumer.subscribe("organization-cleanup", {
    reapExpired: () =>
      Effect.gen(function* () {
        const expired = yield* Effect.gen(function* () {
          const orgRepo = yield* OrganizationRepository
          return yield* orgRepo.listExpiredUnclaimed(new Date())
        }).pipe(withPostgres(OrganizationRepositoryLive, adminClient))

        for (const org of expired) {
          yield* Effect.gen(function* () {
            const orgRepo = yield* OrganizationRepository
            const current = yield* orgRepo
              .findByIdForUpdate(org.id)
              .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
            if (current === null || current.expiresAt === null) return

            yield* teardownOrganizationUseCase({ actorUserId: "system" })
            const deleted = yield* orgRepo.deleteIfExpiredUnclaimed(org.id)
            if (!deleted) return
          }).pipe(
            Effect.provide(ApiKeyCacheInvalidatorLive(redis)),
            Effect.provide(OAuthTokenCacheInvalidatorLive(redis)),
            withPostgres(teardownLayers, adminClient, org.id),
            Effect.tap(() => Effect.sync(() => logger.info(`Reaped expired unclaimed org ${org.id}`))),
            Effect.catch((error) =>
              Effect.sync(() => logger.error(`Failed to reap expired unclaimed org ${org.id}`, error)),
            ),
          )
        }

        if (expired.length > 0) logger.info(`Reaped ${expired.length} expired unclaimed organization(s)`)
      }).pipe(withTracing),
  })
}
