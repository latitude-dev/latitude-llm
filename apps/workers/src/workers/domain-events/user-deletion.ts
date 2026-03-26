import type { QueueConsumer } from "@domain/queue"
import { deleteUserUseCase } from "@domain/users"
import {
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
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

      return deleteUserUseCase({ userId: payload.userId }).pipe(
        withPostgres(repoLayer, pgClient),
        Effect.tap(() => Effect.sync(() => logger.info(`User ${payload.userId} permanently deleted`))),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`User deletion failed for ${payload.userId}`, error)),
        ),
        Effect.asVoid,
      )
    },
  })
}
