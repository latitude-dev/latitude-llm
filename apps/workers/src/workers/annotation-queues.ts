import { addTracesToQueue, type TraceSelection } from "@domain/annotation-queues"
import type { QueueConsumer } from "@domain/queue"
import { AnnotationQueueId, type FilterSet, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { AnnotationQueueItemRepositoryLive, AnnotationQueueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("annotation-queues")

interface BulkImportPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly queueId: string
  readonly selection:
    | { readonly mode: "selected"; readonly traceIds: readonly string[] }
    | { readonly mode: "all"; readonly filters?: Record<string, unknown> }
    | { readonly mode: "allExcept"; readonly traceIds: readonly string[]; readonly filters?: Record<string, unknown> }
}

function deserializeSelection(selection: BulkImportPayload["selection"]): TraceSelection {
  if (selection.mode === "selected") {
    return { mode: "selected", traceIds: selection.traceIds.map(TraceId) }
  }
  if (selection.mode === "all") {
    return {
      mode: "all",
      ...(selection.filters ? { filters: selection.filters as FilterSet } : {}),
    }
  }
  return {
    mode: "allExcept",
    traceIds: selection.traceIds.map(TraceId),
    ...(selection.filters ? { filters: selection.filters as FilterSet } : {}),
  }
}

interface AnnotationQueuesDeps {
  consumer: QueueConsumer
}

export const createAnnotationQueuesWorker = ({ consumer }: AnnotationQueuesDeps) => {
  const pgClient = getPostgresClient()
  const chClient = getClickhouseClient()
  const rdClient = getRedisClient()

  consumer.subscribe("annotation-queues", {
    bulkImport: (payload: BulkImportPayload) => {
      const organizationId = OrganizationId(payload.organizationId)
      const projectId = ProjectId(payload.projectId)
      const queueId = AnnotationQueueId(payload.queueId)
      const selection = deserializeSelection(payload.selection)

      return addTracesToQueue({ projectId, queueId, selection }).pipe(
        withPostgres(
          Layer.mergeAll(AnnotationQueueItemRepositoryLive, AnnotationQueueRepositoryLive),
          pgClient,
          organizationId,
        ),
        withClickHouse(TraceRepositoryLive, chClient, organizationId),
        withAi(AIEmbedLive, rdClient),
        withTracing,
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info("Bulk import completed", {
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              queueId: payload.queueId,
              insertedCount: result.insertedCount,
            }),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error("Bulk import failed", {
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              queueId: payload.queueId,
              error,
            }),
          ),
        ),
        Effect.asVoid,
      )
    },
  })
}
