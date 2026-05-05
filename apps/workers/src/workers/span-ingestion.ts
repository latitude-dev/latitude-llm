import type { EventsPublisher } from "@domain/events"
import type { QueueConsumer, QueuePublishError, QueuePublisherShape } from "@domain/queue"
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
import { getClickhouseClient, getStorageDisk } from "../clients.ts"

const logger = createLogger("span-ingestion")

interface SpanIngestionDeps {
  consumer: QueueConsumer
  eventsPublisher: EventsPublisher<QueuePublishError>
  clickhouseClient?: ClickHouseClient
  disk?: StorageDiskPort
  postgresClient?: PostgresClient
  publisher?: QueuePublisherShape
  redisClient?: RedisClient
}

export const createSpanIngestionWorker = ({
  consumer,
  eventsPublisher,
  clickhouseClient,
  disk: diskDep,
  postgresClient,
  publisher,
  redisClient,
}: SpanIngestionDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const disk = diskDep ?? getStorageDisk()
  const rdClient = redisClient

  const billingPlanLayers = Layer.mergeAll(
    BillingOverrideRepositoryLive,
    SettingsReaderLive,
    StripeSubscriptionLookupLive,
  )

  const recordTraceUsage = publisher
    ? (params: {
        organizationId: OrganizationId
        projectId: ProjectId
        traces: readonly { traceId: string }[]
        context: {
          planSlug: "free" | "pro" | "enterprise"
          planSource: "override" | "subscription" | "free-fallback"
          periodStart: Date
          periodEnd: Date
          includedCredits: number
          overageAllowed: boolean
        }
      }) =>
        publisher.publish(
          "billing",
          "recordTraceUsageBatch",
          {
            organizationId: params.organizationId,
            projectId: params.projectId,
            traceIds: params.traces.map((trace) => trace.traceId),
            planSlug: params.context.planSlug,
            planSource: params.context.planSource,
            periodStart: params.context.periodStart.toISOString(),
            periodEnd: params.context.periodEnd.toISOString(),
            includedCredits: params.context.includedCredits,
            overageAllowed: params.context.overageAllowed,
          },
          {
            attempts: 10,
            backoff: { type: "exponential", delayMs: 1_000 },
          },
        )
    : undefined

  const processSpans = processIngestedSpansUseCase({
    eventsPublisher,
    ...(recordTraceUsage ? { recordTraceUsage } : {}),
  })

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

        if (!postgresClient) {
          return processSpans({
            organizationId: OrganizationId(organizationId),
            projectId: ProjectId(projectId),
            apiKeyId: wire.apiKeyId,
            contentType: wire.contentType || "application/json",
            ingestedAt: wire.ingestedAt ? new Date(wire.ingestedAt) : new Date(),
            inlinePayload: wire.inlinePayload,
            fileKey: wire.fileKey,
          }).pipe(
            Effect.catchTag("SpanDecodingError", (error) =>
              Effect.sync(() => logger.warn("Dropping invalid span payload", error)),
            ),
            Effect.tapError((error) => Effect.sync(() => logger.error("Span ingestion failed", error))),
            withClickHouse(SpanRepositoryLive, chClient, OrganizationId(organizationId)),
            withTracing,
            Effect.provide(StorageDiskLive(disk)),
          )
        }

        const processEffect = Effect.gen(function* () {
          const orgPlan = yield* resolveEffectivePlanCached(OrganizationId(organizationId)).pipe(
            Effect.orElseSucceed(() => null),
          )

          return yield* processSpans({
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
        )

        return rdClient ? processEffect.pipe(Effect.provide(RedisCacheStoreLive(rdClient))) : processEffect
      },
    },
    { concurrency: 50 },
  )
}
