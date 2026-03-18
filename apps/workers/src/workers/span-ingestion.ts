import type { MessageHandler, QueueConsumer, QueueMessage } from "@domain/queue"
import { deleteFromDisk, getFromDisk, OrganizationId } from "@domain/shared"
import {
  decodeOtlpProtobuf,
  type OtlpExportTraceServiceRequest,
  SpanRepository,
  transformOtlpToSpans,
} from "@domain/spans"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getClickhouseClient, getStorageDisk } from "../clients.ts"

const logger = createLogger("span-ingestion")

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

export const createSpanIngestionWorker = (consumer: QueueConsumer) => {
  const chClient = getClickhouseClient()
  const disk = getStorageDisk()

  const handler: MessageHandler = {
    handle: (message: QueueMessage) => {
      const fileKey = new TextDecoder().decode(message.body)
      const contentType = message.headers.get("content-type") ?? "application/json"

      return Effect.gen(function* () {
        const payload = yield* getFromDisk(disk, fileKey)
        const request = decodeRequest(payload, contentType)
        if (!request) {
          logger.error("Span ingestion: failed to decode message")
          return
        }

        if (!request.resourceSpans?.length) {
          return
        }

        const organizationId = message.headers.get("organization-id") ?? ""
        const projectId = message.headers.get("project-id") ?? ""
        const apiKeyId = message.headers.get("api-key-id") ?? ""
        const ingestedAtStr = message.headers.get("ingested-at")
        const ingestedAt = ingestedAtStr ? new Date(ingestedAtStr) : new Date()

        const spans = transformOtlpToSpans(request, { organizationId, projectId, apiKeyId, ingestedAt })
        if (spans.length === 0) {
          return
        }

        const repo = yield* SpanRepository
        yield* repo.insert(spans)
      }).pipe(
        Effect.ensuring(deleteFromDisk(disk, fileKey).pipe(Effect.ignore)),
        Effect.tapError((error) => Effect.sync(() => logger.error("Span ingestion failed", error))),
        withClickHouse(SpanRepositoryLive, chClient, OrganizationId(message.headers.get("organization-id") ?? "")),
      )
    },
  }

  consumer.subscribe("span-ingestion", handler)
}
