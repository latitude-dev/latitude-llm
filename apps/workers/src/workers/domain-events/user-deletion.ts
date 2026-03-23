import { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import type { QueueConsumer } from "@domain/queue"
import { MembershipRepositoryLive, OrganizationRepositoryLive, SqlClientLive } from "@platform/db-postgres"
import { createEventHandler } from "@platform/queue-bullmq"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../../clients.ts"

const logger = createLogger("user-deletion")

export const createUserDeletionWorker = (consumer: QueueConsumer) => {
  consumer.subscribe(
    "user-deletion",
    createEventHandler({
      handle: (event) => {
        const payload = event.event.payload as { userId: string }
        const pgClient = getPostgresClient()

        const repoLayer = Layer.merge(MembershipRepositoryLive, OrganizationRepositoryLive).pipe(
          Layer.provideMerge(SqlClientLive(pgClient)),
        )

        const program = Effect.gen(function* () {
          const membershipRepo = yield* MembershipRepository
          const orgRepo = yield* OrganizationRepository

          // Find all memberships for this user
          const memberships = yield* membershipRepo.findByUserId(payload.userId)

          // For each org, check if user is the sole member
          for (const membership of memberships) {
            const orgMembers = yield* membershipRepo.findByOrganizationId(membership.organizationId)

            if (orgMembers.length === 1) {
              // User is the sole member - delete the organization
              // Cascade will delete the membership too
              yield* orgRepo.delete(membership.organizationId)
              logger.info(`Deleted organization ${membership.organizationId} (sole member was ${payload.userId})`)
            } else {
              // Delete just this membership
              yield* membershipRepo.delete(membership.id)
              logger.info(
                `Removed membership ${membership.id} from organization ${membership.organizationId} for user ${payload.userId}`,
              )

              // If the user was the org creator, clear the creator reference
              const org = yield* orgRepo.findById(membership.organizationId)
              if (org.creatorId === payload.userId) {
                yield* orgRepo.save({ ...org, creatorId: null, updatedAt: new Date() })
              }
            }
          }
        }).pipe(Effect.provide(repoLayer))

        // Delete the user record directly - cascades to sessions, accounts
        const deleteUser = Effect.tryPromise(() =>
          pgClient.pool.query('DELETE FROM latitude."user" WHERE id = $1', [payload.userId]),
        )

        return program.pipe(
          Effect.flatMap(() => deleteUser),
          Effect.tap(() => Effect.sync(() => logger.info(`User ${payload.userId} permanently deleted`))),
          Effect.tapError((error) =>
            Effect.sync(() => logger.error(`User deletion failed for ${payload.userId}`, error)),
          ),
          Effect.asVoid,
        )
      },
    }),
  )
}
