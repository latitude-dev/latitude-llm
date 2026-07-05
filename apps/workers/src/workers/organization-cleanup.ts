import { OrganizationRepository } from "@domain/organizations"
import { purgeOrganizationProjectsUseCase } from "@domain/projects"
import type { QueueConsumer } from "@domain/queue"
import {
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient } from "../clients.ts"

const logger = createLogger("organization-cleanup")

interface OrganizationCleanupDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
}

// Reaps temporary orgs past their claim deadline: per org, soft-delete its projects (ProjectDeleted cascade)
// then hard-delete the org (FK-cascades members/invitations/OAuth). Per-org so one failure never aborts the batch.
export const createOrganizationCleanupWorker = ({ consumer, postgresClient }: OrganizationCleanupDeps) => {
  const adminClient = postgresClient ?? getAdminPostgresClient()

  consumer.subscribe("organization-cleanup", {
    reapExpired: () =>
      Effect.gen(function* () {
        const expired = yield* Effect.gen(function* () {
          const orgRepo = yield* OrganizationRepository
          return yield* orgRepo.listExpiredUnclaimed(new Date())
        }).pipe(withPostgres(OrganizationRepositoryLive, adminClient))

        for (const org of expired) {
          yield* Effect.gen(function* () {
            yield* purgeOrganizationProjectsUseCase({ actorUserId: "system" })
            const orgRepo = yield* OrganizationRepository
            yield* orgRepo.delete(org.id)
          }).pipe(
            withPostgres(
              Layer.mergeAll(ProjectRepositoryLive, OrganizationRepositoryLive, OutboxEventWriterLive),
              adminClient,
              org.id,
            ),
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
