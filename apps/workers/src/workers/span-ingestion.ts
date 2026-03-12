import type { ClickHouseClient } from "@clickhouse/client"
import { SPAN_INGESTION_QUEUE } from "@domain/shared"
import type { StorageDiskPort } from "@domain/shared"
import type { TransformContext } from "@domain/spans"
import { transformOtlpToSpans } from "@domain/spans"
import type { OtlpExportTraceServiceRequest } from "@domain/spans"
import type { RedisConnection } from "@platform/cache-redis"
import { createSpanClickhouseRepository } from "@platform/db-clickhouse"
import { type Job, Queue, Worker } from "bullmq"
import { Effect } from "effect"

interface StoredPayload {
  readonly request: OtlpExportTraceServiceRequest
  readonly context: Omit<TransformContext, "ingestedAt">
  readonly ingestedAt?: string
}

interface SpanIngestionWorkerConfig {
  readonly redisConnection: RedisConnection
  readonly clickhouseClient: ClickHouseClient
  readonly storageDisk: StorageDiskPort
}

const createProcessor =
  ({ clickhouseClient, storageDisk }: { clickhouseClient: ClickHouseClient; storageDisk: StorageDiskPort }) =>
  async (job: Job<{ storageKey: string }>) => {
    const { storageKey } = job.data

    const raw = await storageDisk.get(storageKey)
    const { request, context, ingestedAt } = JSON.parse(raw) as StoredPayload

    const spans = transformOtlpToSpans(request, {
      ...context,
      ingestedAt: ingestedAt ? new Date(ingestedAt) : new Date(),
    })

    if (spans.length > 0) {
      const spanRepository = createSpanClickhouseRepository(clickhouseClient)
      await Effect.runPromise(spanRepository.insert(spans))
    }

    await storageDisk.delete(storageKey)
  }

export const createSpanIngestionWorker = ({
  redisConnection,
  clickhouseClient,
  storageDisk,
}: SpanIngestionWorkerConfig) => {
  const queue = new Queue(SPAN_INGESTION_QUEUE, { connection: redisConnection })

  const worker = new Worker(SPAN_INGESTION_QUEUE, createProcessor({ clickhouseClient, storageDisk }), {
    connection: redisConnection,
  })

  return { queue, worker }
}
