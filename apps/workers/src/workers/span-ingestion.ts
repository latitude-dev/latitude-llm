import { OrganizationId } from "@domain/shared"
import {
  decodeOtlpProtobuf,
  type OtlpExportTraceServiceRequest,
  SpanRepository,
  transformOtlpToSpans,
} from "@domain/spans"
import { ChSqlClientLive, SpanRepositoryLive } from "@platform/db-clickhouse"
import { Topics } from "@platform/queue-redpanda"
import { Effect } from "effect"
import type { IHeaders, Kafka } from "kafkajs"
import { getClickhouseClient } from "../clients.ts"

function decodeRequest(value: Buffer, headers: IHeaders | undefined): OtlpExportTraceServiceRequest | null {
  const contentType = headers?.["content-type"]?.toString() ?? "application/json"
  try {
    if (contentType.includes("application/x-protobuf")) {
      return decodeOtlpProtobuf(new Uint8Array(value))
    }
    return JSON.parse(value.toString()) as OtlpExportTraceServiceRequest
  } catch {
    return null
  }
}

function headerString(headers: IHeaders | undefined, key: string): string {
  return headers?.[key]?.toString() ?? ""
}

export const createSpanIngestionWorker = (kafka: Kafka, groupId: string) => {
  const consumer = kafka.consumer({ groupId })
  const chClient = getClickhouseClient()

  let isRunning = false

  const start = async (): Promise<void> => {
    await consumer.connect()
    await consumer.subscribe({ topic: Topics.spanIngestion })

    isRunning = true

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!isRunning) return

        const { value, headers } = message
        if (!value) {
          await Effect.runPromise(Effect.logError("Span ingestion: received message with null value"))
          return
        }

        const request = decodeRequest(value, headers)
        if (!request) {
          await Effect.runPromise(Effect.logError("Span ingestion: failed to decode message"))
          return
        }

        if (!request.resourceSpans?.length) return

        const organizationId = headerString(headers, "organization-id")
        const projectId = headerString(headers, "project-id")
        const apiKeyId = headerString(headers, "api-key-id")
        const ingestedAt = new Date(headerString(headers, "ingested-at") || Date.now())

        const spans = transformOtlpToSpans(request, { organizationId, projectId, apiKeyId, ingestedAt })
        if (spans.length === 0) return

        try {
          await Effect.runPromise(
            Effect.gen(function* () {
              const repo = yield* SpanRepository
              yield* repo.insert(spans)
            }).pipe(
              Effect.provide(SpanRepositoryLive),
              Effect.provide(ChSqlClientLive(chClient, OrganizationId(organizationId))),
            ),
          )
        } catch (error) {
          await Effect.runPromise(Effect.logError(`Span ingestion: failed to insert spans: ${error}`))
        }
      },
    })
  }

  const stop = async (): Promise<void> => {
    isRunning = false
    await consumer.disconnect()
  }

  return { start, stop }
}
