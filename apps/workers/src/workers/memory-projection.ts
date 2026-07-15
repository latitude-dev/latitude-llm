import { materializeTraceMemoryUseCase } from "@domain/memories"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import {
  type ClickHouseClient,
  MemoryRepositoryLive,
  SpanRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

import { getClickhouseClient } from "../clients.ts"

const logger = createLogger("memory-projection")
const QUEUE = "memory-projection" as const
const RUN_TASK = "run" as const

interface RunPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

type MemoryProjectionLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface MemoryProjectionDeps {
  consumer: QueueConsumer
  clickhouseClient?: ClickHouseClient
  logger?: MemoryProjectionLogger
}

const buildLogContext = (payload: RunPayload) => ({
  queue: QUEUE,
  task: RUN_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  traceId: payload.traceId,
})

export const createMemoryProjectionWorker = ({
  consumer,
  clickhouseClient,
  logger: injectedLogger,
}: MemoryProjectionDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const log = injectedLogger ?? logger

  consumer.subscribe(QUEUE, {
    run: (payload: RunPayload) =>
      materializeTraceMemoryUseCase({
        organizationId: OrganizationId(payload.organizationId),
        projectId: ProjectId(payload.projectId),
        traceId: TraceId(payload.traceId),
      }).pipe(
        withClickHouse(
          Layer.mergeAll(SpanRepositoryLive, MemoryRepositoryLive),
          chClient,
          OrganizationId(payload.organizationId),
        ),
        withTracing,
        Effect.tap((result) =>
          Effect.sync(() => log.info("Memory projection completed", { ...buildLogContext(payload), ...result })),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => log.error("Memory projection failed", { ...buildLogContext(payload), error })),
        ),
        Effect.asVoid,
      ),
  })
}
