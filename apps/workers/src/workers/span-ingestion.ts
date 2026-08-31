import { persistedIncludedCreditsForPlan } from "@domain/billing"
import type { EventsPublisher } from "@domain/events"
import type { QueueConsumer, QueuePublishError } from "@domain/queue"
import { OrganizationId, type StorageDiskPort } from "@domain/shared"
import { processIngestedSpansUseCase } from "@domain/spans"
import { RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import {
  BillingOverrideRepositoryLive,
  OrganizationRepositoryLive,
  resolveEffectivePlanCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnvOptional } from "@platform/env"
import { StorageDiskLive } from "@platform/storage-object"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { reportUnpricedSpans } from "./unpriced-spans-report.ts"

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

  const postgresLayers = Layer.mergeAll(
    BillingOverrideRepositoryLive,
    SettingsReaderLive,
    StripeSubscriptionLookupLive,
    OrganizationRepositoryLive,
  )

  const processSpans = processIngestedSpansUseCase({ eventsPublisher, onUnpricedSpans: reportUnpricedSpans })

  // Unset degrades pseudonymized identities to full redaction rather than blocking
  // a self-hoster's ingestion on a missing variable.
  const pseudonymSecret = Effect.runSync(parseEnvOptional("LAT_REDACTION_PSEUDONYM_SECRET", "string"))

  consumer.subscribe(
    "span-ingestion",
    {
      ingest: (wire) => {
        const organizationId = wire.organizationId
        if (!organizationId) {
          logger.error("Span ingestion: missing organizationId in message")
          return Effect.void
        }

        // In-flight queue messages enqueued before this PR carried `projectId` at the batch
        // level and no `projectIdBySlug`. Treat them as a single-project ingest using that
        // legacy `projectId` as the default — keeps the queue draining cleanly during rollout.
        const legacy = wire as unknown as { projectId?: string }
        const defaultProjectId = wire.defaultProjectId ?? legacy.projectId ?? null
        const projectIdBySlug = wire.projectIdBySlug ?? {}
        const isSandbox = wire.isSandbox ?? false

        const processEffect = Effect.gen(function* () {
          const orgPlan = yield* resolveEffectivePlanCached(OrganizationId(organizationId)).pipe(
            Effect.orElseSucceed(() => null),
          )

          yield* processSpans({
            organizationId: OrganizationId(organizationId),
            apiKeyId: wire.apiKeyId,
            contentType: wire.contentType || "application/json",
            ingestedAt: wire.ingestedAt ? new Date(wire.ingestedAt) : new Date(),
            inlinePayload: wire.inlinePayload,
            fileKey: wire.fileKey,
            defaultProjectId,
            projectIdBySlug,
            isSandbox,
            // Absent means no project opted in, which is why this needs no legacy
            // fallback: jobs enqueued before the field existed are correct as-is.
            ...(wire.redaction ? { redaction: wire.redaction } : {}),
            ...(pseudonymSecret ? { pseudonymSecret } : {}),
            ...(orgPlan ? { retentionDays: orgPlan.plan.retentionDays } : {}),
            // Emit the full event (plan snapshot + the `isSandbox` bit). Whether to
            // bill is the consumer's call — the `billing` worker drops sandbox usage
            // rather than batching it.
            ...(orgPlan
              ? {
                  traceUsage: {
                    context: {
                      planSlug: orgPlan.plan.slug,
                      planSource: orgPlan.source as "override" | "subscription" | "free-fallback" | "self-hosted",
                      periodStart: orgPlan.periodStart,
                      periodEnd: orgPlan.periodEnd,
                      // An unbounded allowance has no JSON representation, and this
                      // snapshot crosses BullMQ and the outbox before it is read.
                      includedCredits: persistedIncludedCreditsForPlan(
                        orgPlan.plan.slug,
                        orgPlan.plan.includedCredits,
                      ),
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
          withPostgres(postgresLayers, postgresClient, OrganizationId(organizationId)),
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
