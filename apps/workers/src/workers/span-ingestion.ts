import type { EventsPublisher } from "@domain/events"
import type { QueueConsumer, QueuePublishError } from "@domain/queue"
import { OrganizationId, ProjectId, type StorageDiskPort } from "@domain/shared"
import { processIngestedSpansUseCase } from "@domain/spans"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { StorageDiskLive } from "@platform/storage-object"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getClickhouseClient, getStorageDisk } from "../clients.ts"

const logger = createLogger("span-ingestion")

interface SpanIngestionDeps {
  consumer: QueueConsumer
  eventsPublisher: EventsPublisher<QueuePublishError>
  clickhouseClient?: ClickHouseClient
  disk?: StorageDiskPort
}

export const createSpanIngestionWorker = ({
  consumer,
  eventsPublisher,
  clickhouseClient,
  disk: diskDep,
}: SpanIngestionDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const disk = diskDep ?? getStorageDisk()
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

        return processSpans({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(projectId),
          apiKeyId: wire.apiKeyId,
          contentType: wire.contentType || "application/json",
          ingestedAt: wire.ingestedAt ? new Date(wire.ingestedAt) : new Date(),
          inlinePayload: wire.inlinePayload,
          fileKey: wire.fileKey,
        }).pipe(
          Effect.tapError((error) => Effect.sync(() => logger.error("Span ingestion failed", error))),
          withClickHouse(SpanRepositoryLive, chClient, OrganizationId(organizationId)),
          Effect.provide(StorageDiskLive(disk)),
        )
      },
    },
    { concurrency: 50 },
  )
}
