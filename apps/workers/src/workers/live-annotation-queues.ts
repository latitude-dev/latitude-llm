import {
  type AnnotationQueueItemRepository,
  type AnnotationQueueRepository,
  type CurateLiveAnnotationQueuesError,
  type CurateLiveAnnotationQueuesInput,
  type CurateLiveAnnotationQueuesResult,
  curateLiveAnnotationQueuesUseCase,
} from "@domain/annotation-queues"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, type SqlClient } from "@domain/shared"
import type { TraceRepository } from "@domain/spans"
import { type ClickHouseClient, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AnnotationQueueItemRepositoryLive,
  AnnotationQueueRepositoryLive,
  type PostgresClient,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("live-annotation-queues")
const LIVE_ANNOTATION_QUEUES_QUEUE = "live-annotation-queues" as const
const LIVE_ANNOTATION_QUEUES_CURATE_TASK = "curate" as const

export interface CuratePayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

interface LiveAnnotationQueuesDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
}

const buildCurateLogContext = (payload: CuratePayload) => ({
  queue: LIVE_ANNOTATION_QUEUES_QUEUE,
  task: LIVE_ANNOTATION_QUEUES_CURATE_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  traceId: payload.traceId,
})

type CurateUseCaseRequirements = SqlClient | TraceRepository | AnnotationQueueRepository | AnnotationQueueItemRepository

type CurateUseCase = (
  input: CurateLiveAnnotationQueuesInput,
) => Effect.Effect<CurateLiveAnnotationQueuesResult, CurateLiveAnnotationQueuesError, CurateUseCaseRequirements>

interface CurateHandlerDeps {
  readonly useCase: CurateUseCase
  readonly postgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
  readonly log: typeof logger
}

export const createCurateHandler =
  ({ useCase, postgresClient, clickhouseClient, log }: CurateHandlerDeps) =>
  (payload: CuratePayload) =>
    useCase(payload).pipe(
      withPostgres(
        Layer.mergeAll(AnnotationQueueRepositoryLive, AnnotationQueueItemRepositoryLive),
        postgresClient,
        OrganizationId(payload.organizationId),
      ),
      withClickHouse(TraceRepositoryLive, clickhouseClient, OrganizationId(payload.organizationId)),
      withTracing,
      Effect.tap((result) =>
        Effect.sync(() => {
          if (result.action === "skipped") {
            log.info("Live annotation queue curate skipped", {
              ...buildCurateLogContext(payload),
              outcome: result.action,
              reason: result.reason,
            })
            return
          }

          log.info("Live annotation queue curate completed", {
            ...buildCurateLogContext(payload),
            outcome: result.action,
            liveQueuesScanned: result.summary.liveQueuesScanned,
            filterMatchedCount: result.summary.filterMatchedCount,
            skippedSamplingCount: result.summary.skippedSamplingCount,
            insertedItemCount: result.summary.insertedItemCount,
          })
        }),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          log.error("Live annotation queue curate failed", {
            ...buildCurateLogContext(payload),
            outcome: "failed",
            error,
          }),
        ),
      ),
      Effect.asVoid,
    )

export const createLiveAnnotationQueuesWorker = ({
  consumer,
  postgresClient,
  clickhouseClient,
}: LiveAnnotationQueuesDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()

  consumer.subscribe(LIVE_ANNOTATION_QUEUES_QUEUE, {
    curate: createCurateHandler({
      useCase: curateLiveAnnotationQueuesUseCase,
      postgresClient: pgClient,
      clickhouseClient: chClient,
      log: logger,
    }),
  })
}
