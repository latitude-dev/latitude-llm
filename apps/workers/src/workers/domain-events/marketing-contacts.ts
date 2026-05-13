import {
  type MarketingContactsPort,
  markContactTelemetryEnabled,
  registerContact,
  updateContactOnboarding,
} from "@domain/marketing"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { MembershipRepositoryLive, type PostgresClient, UserRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getMarketingContactsSender } from "../../clients.ts"

const logger = createLogger("marketing-contacts")

interface MarketingContactsWorkerDeps {
  consumer: QueueConsumer
  /** Injected in tests; defaults to the memoized workers marketing-contacts sender. */
  marketingSender?: MarketingContactsPort
  /** Injected in tests; defaults to the admin Postgres client (RLS-bypassing). */
  postgresClient?: PostgresClient
}

/**
 * Marketing-contact lifecycle worker.
 *
 * Each task delegates to a `@domain/marketing` use case. The worker only
 * provides infrastructure layers (repos + postgres client) and observability;
 * no business logic lives here.
 */
export const createMarketingContactsWorker = ({
  consumer,
  marketingSender,
  postgresClient,
}: MarketingContactsWorkerDeps) => {
  const sender = marketingSender ?? getMarketingContactsSender()
  const pgClient = postgresClient ?? getAdminPostgresClient()
  const repos = Layer.mergeAll(UserRepositoryLive, MembershipRepositoryLive)

  consumer.subscribe("marketing-contacts", {
    "register-user": (payload) =>
      registerContact({ marketingContacts: sender })({ userId: payload.userId }).pipe(
        withPostgres(repos, pgClient),
        Effect.tap(() =>
          Effect.sync(() => logger.info(`marketing register-user processed for user ${payload.userId}`)),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`marketing register-user failed for user ${payload.userId}`, error)),
        ),
        withTracing,
      ),

    "update-onboarding": (payload) =>
      updateContactOnboarding({ marketingContacts: sender })({
        userId: payload.userId,
        stackChoice: payload.stackChoice,
      }).pipe(
        withPostgres(repos, pgClient),
        Effect.tap(() =>
          Effect.sync(() => logger.info(`marketing update-onboarding processed for user ${payload.userId}`)),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`marketing update-onboarding failed for user ${payload.userId}`, error)),
        ),
        withTracing,
      ),

    "mark-telemetry-enabled": (payload) =>
      markContactTelemetryEnabled({ marketingContacts: sender })({
        organizationId: payload.organizationId,
      }).pipe(
        withPostgres(repos, pgClient, OrganizationId(payload.organizationId)),
        Effect.tap(() =>
          Effect.sync(() =>
            logger.info(`marketing mark-telemetry-enabled processed for org ${payload.organizationId}`),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`marketing mark-telemetry-enabled failed for org ${payload.organizationId}`, error),
          ),
        ),
        withTracing,
      ),
  })
}
