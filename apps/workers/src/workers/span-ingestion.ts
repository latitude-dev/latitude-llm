import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { deleteFromDisk, getFromDisk, OrganizationId, type StorageDiskPort } from "@domain/shared"
import { SpanRepository } from "@domain/spans"
import { decodeOtlpProtobuf, type OtlpExportTraceServiceRequest, transformOtlpToSpans } from "@domain/spans/otlp"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getClickhouseClient, getStorageDisk } from "../clients.ts"

const logger = createLogger("span-ingestion")

interface SpanIngestionWorkerDependencies {
  readonly clickhouseClient?: ClickHouseClient
  readonly disk?: StorageDiskPort
  readonly queuePublisher?: QueuePublisherShape
  readonly logger?: Pick<typeof logger, "error">
}

const TRACE_END_DEBOUNCE_MS = 5 * 60 * 1000 // 5 minutes

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

// TODO(workers): worker handlers are thin app boundaries that route data to business
// logic implementation within domains. Refactor this handler.
export const createSpanIngestionWorker = (
  consumer: QueueConsumer,
  queuePublisher: QueuePublisherShape,
  deps: SpanIngestionWorkerDependencies = {},
) => {
  const chClient = deps.clickhouseClient ?? getClickhouseClient()
  const disk = deps.disk ?? getStorageDisk()
  const pub = deps.queuePublisher ?? queuePublisher

  consumer.subscribe("span-ingestion", {
    ingest: (message) => {
      const contentType = message.contentType || "application/json"

      return Effect.gen(function* () {
        const payload = yield* getFromDisk(disk, message.fileKey)
        const request = decodeRequest(payload, contentType)
        if (!request) {
          logger.error("Span ingestion: failed to decode message")
          return
        }

        if (!request.resourceSpans?.length) {
          return
        }

        const organizationId = message.organizationId
        const projectId = message.projectId
        if (!organizationId || !projectId) {
          logger.error("Span ingestion: missing organizationId or projectId in message")
          return
        }
        const apiKeyId = message.apiKeyId
        const ingestedAt = message.ingestedAt ? new Date(message.ingestedAt) : new Date()

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
        yield* deleteFromDisk(disk, message.fileKey).pipe(Effect.ignore)

        const traceIds = new Set(spans.map((s) => s.traceId))
        yield* Effect.all(
          [...traceIds].map((traceId) =>
            pub.publish(
              "live-traces",
              "end",
              { organizationId, projectId, traceId },
              {
                dedupeKey: `live-traces:end:${organizationId}:${projectId}:${traceId}`,
                debounceMs: TRACE_END_DEBOUNCE_MS,
              },
            ),
          ),
          { concurrency: "unbounded" },
        )
      }).pipe(
        Effect.tapError((error) => Effect.sync(() => logger.error("Span ingestion failed", error))),
        withClickHouse(SpanRepositoryLive, chClient, OrganizationId(message.organizationId)),
      )
    },
  })
}
