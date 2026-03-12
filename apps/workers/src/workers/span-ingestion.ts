import type { ClickHouseClient } from "@clickhouse/client"
import { type OrganizationId, SPAN_INGESTION_QUEUE, type StorageDiskPort } from "@domain/shared"
import type { OtlpExportTraceServiceRequest, TransformContext } from "@domain/spans"
import { SpanRepository, transformOtlpToSpans } from "@domain/spans"
import type { RedisConnection } from "@platform/cache-redis"
import { ChSqlClientLive, SpanRepositoryLive } from "@platform/db-clickhouse"
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
      await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* SpanRepository
          yield* repo.insert(spans)
        }).pipe(
          Effect.provide(SpanRepositoryLive),
          Effect.provide(ChSqlClientLive(clickhouseClient, context.organizationId as OrganizationId)),
        ),
      )
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
