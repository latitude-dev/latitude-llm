import type { EventsPublisher } from "@domain/events"
import type { QueueConsumer, QueuePublishError } from "@domain/queue"
import { OrganizationId, ProjectId, type StorageDiskPort } from "@domain/shared"
import { processIngestedSpansUseCase } from "@domain/spans"
import { RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import {
  BillingOverrideRepositoryLive,
  resolveEffectivePlanCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { StorageDiskLive } from "@platform/storage-object"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

const logger = createLogger("span-ingestion")

interface SpanIngestionDeps {
  consumer: QueueConsumer
  eventsPublisher: EventsPublisher<QueuePublishError>
  clickhouseClient: ClickHouseClient
  disk: StorageDiskPort
  postgresClient: PostgresClient
  redisClient: RedisClient
}

export const createSpanIngestionWorker = ({
  consumer,
  eventsPublisher,
  clickhouseClient,
  disk,
  postgresClient,
  redisClient,
}: SpanIngestionDeps) => {
  const chClient = clickhouseClient
  const rdClient = redisClient

  const billingPlanLayers = Layer.mergeAll(
    BillingOverrideRepositoryLive,
    SettingsReaderLive,
    StripeSubscriptionLookupLive,
  )

  const processSpans = processIngestedSpansUseCase({ eventsPublisher })

  consumer.subscribe(
    "span-ingestion",
    {
      ingest: (wire) => {
        const organizationId = wire.organizationId
        const projectId = wire.projectId
        if (!organizationId || !projectId) {
          logger.error("Span ingestion: missing organizationId or projectId in message")
          return Effect.void
        }

        const processEffect = Effect.gen(function* () {
          const orgPlan = yield* resolveEffectivePlanCached(OrganizationId(organizationId)).pipe(
            Effect.orElseSucceed(() => null),
          )

          yield* processSpans({
            organizationId: OrganizationId(organizationId),
            projectId: ProjectId(projectId),
            apiKeyId: wire.apiKeyId,
            contentType: wire.contentType || "application/json",
            ingestedAt: wire.ingestedAt ? new Date(wire.ingestedAt) : new Date(),
            inlinePayload: wire.inlinePayload,
            fileKey: wire.fileKey,
            ...(orgPlan ? { retentionDays: orgPlan.plan.retentionDays } : {}),
            ...(orgPlan
              ? {
                  traceUsage: {
                    context: {
                      planSlug: orgPlan.plan.slug,
                      planSource: orgPlan.source as "override" | "subscription" | "free-fallback",
                      periodStart: orgPlan.periodStart,
                      periodEnd: orgPlan.periodEnd,
                      includedCredits: orgPlan.plan.includedCredits,
                      overageAllowed: orgPlan.plan.overageAllowed,
                    },
                  },
                }
              : {}),
          })
        }).pipe(
          Effect.catchTag("SpanDecodingError", (error) =>
            Effect.sync(() => logger.warn("Dropping invalid span payload", error)),
          ),
          Effect.tapError((error) => Effect.sync(() => logger.error("Span ingestion failed", error))),
          withPostgres(billingPlanLayers, postgresClient, OrganizationId(organizationId)),
          withClickHouse(SpanRepositoryLive, chClient, OrganizationId(organizationId)),
          withTracing,
          Effect.provide(StorageDiskLive(disk)),
          Effect.provide(RedisCacheStoreLive(rdClient)),
        )

        return processEffect
      },
    },
    { concurrency: 50 },
  )
}
