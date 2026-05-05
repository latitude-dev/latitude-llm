import { buildBillingIdempotencyKey, meterBillableAction, resolveEffectivePlan } from "@domain/billing"
import type { EventsPublisher } from "@domain/events"
import { type QueueConsumer, type QueuePublishError, QueuePublisher, type QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId, type StorageDiskPort, TraceId } from "@domain/shared"
import { processIngestedSpansUseCase } from "@domain/spans"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import {
  BillingOverageReporterLive,
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
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
}

export const createSpanIngestionWorker = ({
  consumer,
  eventsPublisher,
  clickhouseClient,
  disk: diskDep,
  postgresClient,
  publisher,
}: SpanIngestionDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const disk = diskDep ?? getStorageDisk()

  const billingLayers = Layer.mergeAll(
    BillingOverageReporterLive,
    BillingOverrideRepositoryLive,
    BillingUsageEventRepositoryLive,
    BillingUsagePeriodRepositoryLive,
    SettingsReaderLive,
    StripeSubscriptionLookupLive,
  )

  const recordTraceUsage =
    postgresClient && publisher
      ? (params: { organizationId: string; projectId: string; traces: readonly { traceId: string }[] }) =>
          Effect.runPromise(
            Effect.gen(function* () {
              yield* Effect.all(
                params.traces.map((t) =>
                  meterBillableAction({
                    organizationId: OrganizationId(params.organizationId),
                    projectId: ProjectId(params.projectId),
                    action: "trace",
                    idempotencyKey: buildBillingIdempotencyKey("trace", [
                      params.organizationId,
                      params.projectId,
                      t.traceId,
                    ]),
                    traceId: TraceId(t.traceId),
                  }).pipe(
                    Effect.tap((result) =>
                      result.allowed
                        ? Effect.void
                        : Effect.sync(() =>
                            logger.warn("Trace billing recorded as overshoot — billing limit reached", {
                              organizationId: params.organizationId,
                              projectId: params.projectId,
                              traceId: t.traceId,
                            }),
                          ),
                    ),
                  ),
                ),
                { concurrency: 8, discard: true },
              )
            }).pipe(
              withPostgres(billingLayers, postgresClient, OrganizationId(params.organizationId)),
              Effect.provideService(QueuePublisher, publisher),
              withTracing,
            ),
          )
            .then(() => undefined)
            .catch((error) => {
              logger.error("Trace billing recording failed after span persistence", {
                organizationId: params.organizationId,
                projectId: params.projectId,
                traceCount: params.traces.length,
                traceIds: params.traces.map((trace) => trace.traceId),
                error,
              })
              return undefined
            })
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

        return Effect.gen(function* () {
          const orgPlan = yield* resolveEffectivePlan(OrganizationId(organizationId)).pipe(
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
          })
        }).pipe(
          Effect.catchTag("SpanDecodingError", (error) =>
            Effect.sync(() => logger.warn("Dropping invalid span payload", error)),
          ),
          Effect.tapError((error) => Effect.sync(() => logger.error("Span ingestion failed", error))),
          withPostgres(billingLayers, postgresClient, OrganizationId(organizationId)),
          withClickHouse(SpanRepositoryLive, chClient, OrganizationId(organizationId)),
          withTracing,
          Effect.provide(StorageDiskLive(disk)),
        )
      },
    },
    { concurrency: 50 },
  )
}
