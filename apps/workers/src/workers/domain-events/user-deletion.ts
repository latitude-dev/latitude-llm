import { purgeOrganizationProjectsUseCase } from "@domain/projects"
import type { QueueConsumer } from "@domain/queue"
import { deleteUserUseCase } from "@domain/users"
import {
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient } from "../../clients.ts"

const logger = createLogger("user-deletion")

interface UserDeletionDeps {
  consumer: QueueConsumer
}

export const createUserDeletionWorker = ({ consumer }: UserDeletionDeps) => {
  consumer.subscribe("user-deletion", {
    delete: (payload) => {
      const pgClient = getAdminPostgresClient()
      const repoLayer = Layer.mergeAll(MembershipRepositoryLive, OrganizationRepositoryLive, UserRepositoryLive)
      const projectLayer = Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive)

      return Effect.gen(function* () {
        const { deletedOrganizationIds } = yield* deleteUserUseCase({ userId: payload.userId }).pipe(
          withPostgres(repoLayer, pgClient),
        )

        // Tear down projects of each sole-member org we deleted. Projects have
        // no FK to the org, so this must run explicitly — scoped per org so the
        // RLS / SqlClient context matches the projects being purged.
        for (const organizationId of deletedOrganizationIds) {
          yield* purgeOrganizationProjectsUseCase({ actorUserId: payload.userId }).pipe(
            withPostgres(projectLayer, pgClient, organizationId),
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
