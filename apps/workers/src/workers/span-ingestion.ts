import type { MessageHandler, QueueConsumer, QueueMessage } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import {
  decodeOtlpProtobuf,
  type OtlpExportTraceServiceRequest,
  SpanRepository,
  transformOtlpToSpans,
} from "@domain/spans"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getClickhouseClient } from "../clients.ts"

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

  const handler: MessageHandler = {
    handle: (message: QueueMessage) => {
      const contentType = message.headers.get("content-type") ?? "application/json"
      const request = decodeRequest(message.body, contentType)
      if (!request) {
        logger.error("Span ingestion: failed to decode message")
        return Effect.void
      }

      if (!request.resourceSpans?.length) return Effect.void

      const organizationId = message.headers.get("organization-id") ?? ""
      const projectId = message.headers.get("project-id") ?? ""
      const apiKeyId = message.headers.get("api-key-id") ?? ""
      const ingestedAtStr = message.headers.get("ingested-at")
      const ingestedAt = ingestedAtStr ? new Date(ingestedAtStr) : new Date()

      const spans = transformOtlpToSpans(request, { organizationId, projectId, apiKeyId, ingestedAt })
      if (spans.length === 0) return Effect.void

      return Effect.gen(function* () {
        const repo = yield* SpanRepository
        yield* repo.insert(spans)
      }).pipe(withClickHouse(SpanRepositoryLive, chClient, OrganizationId(organizationId)))
    },
  }

  consumer.subscribe("span-ingestion", handler)
}
