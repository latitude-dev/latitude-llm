import type { EventsPublisher } from "@domain/events"
import type { QueueConsumer, QueuePublishError } from "@domain/queue"
import { getFromDisk, OrganizationId, type StorageDiskPort } from "@domain/shared"
import { SpanRepository } from "@domain/spans"
import { decodeOtlpProtobuf, type OtlpExportTraceServiceRequest, transformOtlpToSpans } from "@domain/spans/otlp"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
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

function decodeRequest(value: Uint8Array, contentType: string): OtlpExportTraceServiceRequest | null {
  try {
    if (contentType.includes("application/x-protobuf")) {
      return decodeOtlpProtobuf(value)
    }
    return JSON.parse(new TextDecoder().decode(value)) as OtlpExportTraceServiceRequest
  } catch {
    return null
  }
}

export const createSpanIngestionWorker = ({
  consumer,
  eventsPublisher,
  clickhouseClient,
  disk: diskDep,
}: SpanIngestionDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const disk = diskDep ?? getStorageDisk()
  const pub = eventsPublisher
  const workerLogger = logger

  consumer.subscribe("span-ingestion", {
    ingest: (wire) => {
      const contentType = wire.contentType || "application/json"

      return Effect.gen(function* () {
        let payload: Uint8Array

        if (wire.inlinePayload) {
          payload = Buffer.from(wire.inlinePayload, "base64")
        } else if (wire.fileKey) {
          payload = yield* getFromDisk(disk, wire.fileKey)
        } else {
          workerLogger.error("Span ingestion: no inline payload or fileKey in message")
          return
        }

        const request = decodeRequest(payload, contentType)
        if (!request) {
          workerLogger.error("Span ingestion: failed to decode message")
          return
        }

        if (!request.resourceSpans?.length) {
          return
        }

        const organizationId = wire.organizationId
        const projectId = wire.projectId
        if (!organizationId || !projectId) {
          workerLogger.error("Span ingestion: missing organizationId or projectId in message")
          return
        }
        const apiKeyId = wire.apiKeyId
        const ingestedAt = wire.ingestedAt ? new Date(wire.ingestedAt) : new Date()

        const spans = transformOtlpToSpans(request, {
          organizationId,
          projectId,
          apiKeyId,
          ingestedAt,
        })
        if (spans.length === 0) {
          return
        }

        const repo = yield* SpanRepository
        yield* repo.insert(spans)
        // S3 cleanup handled by lifecycle policy on the ingest/ prefix

        const traceIds = new Set(spans.map((s) => s.traceId))
        yield* Effect.all(
          [...traceIds].map((traceId) =>
            pub.publish({ name: "SpanIngested", organizationId, payload: { organizationId, projectId, traceId } }),
          ),
          { concurrency: "unbounded" },
        )
      }).pipe(
        Effect.tapError((error) => Effect.sync(() => workerLogger.error("Span ingestion failed", error))),
        withClickHouse(SpanRepositoryLive, chClient, OrganizationId(wire.organizationId)),
      )
    },
  })
}
