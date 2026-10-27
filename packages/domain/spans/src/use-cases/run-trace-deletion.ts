import { OutboxEventWriter } from "@domain/events"
import {
  type ProjectId,
  type SessionId,
  SqlClient,
  type TraceDeletionRequestId,
  type TraceId,
  toRepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import {
  isTraceDeletionFinished,
  markTraceDeletionCompleted,
  markTraceDeletionFailed,
  markTraceDeletionRunning,
  type TraceDeletionRequest,
  withTraceDeletionCutoff,
} from "../entities/trace-deletion-request.ts"
import { TraceDeletionRequestRepository } from "../ports/trace-deletion-request-repository.ts"
import { type PurgedRowCounts, TracePurgeRepository } from "../ports/trace-purge-repository.ts"
import { TraceReferencePurgeRepository } from "../ports/trace-reference-purge-repository.ts"
import { TraceRepository } from "../ports/trace-repository.ts"

export const TRACE_DELETION_BATCH_SIZE = 500

const prefixCounts = (store: "clickhouse" | "postgres", counts: PurgedRowCounts): PurgedRowCounts =>
  Object.fromEntries(Object.entries(counts).map(([table, rows]) => [`${store}.${table}`, rows]))

export const mergeRowCounts = (...counts: readonly PurgedRowCounts[]): Record<string, number> => {
  const merged: Record<string, number> = {}
  for (const entry of counts) {
    for (const [key, rows] of Object.entries(entry)) merged[key] = (merged[key] ?? 0) + rows
  }
  return merged
}

/** Marks the request running; a request that already finished is returned as is so a replay is a no-op. */
export const startTraceDeletionUseCase = Effect.fn("spans.startTraceDeletion")(function* (
  requestId: TraceDeletionRequestId,
) {
  yield* Effect.annotateCurrentSpan("traceDeletionRequest.id", requestId)
  const repository = yield* TraceDeletionRequestRepository
  const request = yield* repository.findById(requestId)
  if (isTraceDeletionFinished(request)) return request

  const running = markTraceDeletionRunning(request)
  yield* repository.save(running)
  return running
})

/**
 * Reads the next page of traces the request still matches, their session keys, and how
 * many rows each store holds for them. It only reads, so its counts are the receipt for
 * the batch however many times the purges that follow are retried.
 */
export const prepareTraceDeletionBatchUseCase = Effect.fn("spans.prepareTraceDeletionBatch")(function* (input: {
  readonly request: Pick<TraceDeletionRequest, "id" | "projectId" | "filters" | "createdAt">
  readonly batchSize: number
}) {
  const { request } = input
  yield* Effect.annotateCurrentSpan("traceDeletionRequest.id", request.id)
  const sqlClient = yield* SqlClient
  const traces = yield* TraceRepository
  const purge = yield* TracePurgeRepository
  const references = yield* TraceReferencePurgeRepository
  const scope = { organizationId: sqlClient.organizationId, projectId: request.projectId }

  const page = yield* traces.listByProjectId({
    ...scope,
    options: { limit: input.batchSize, filters: withTraceDeletionCutoff(request.filters, request.createdAt) },
  })
  const traceIds: TraceId[] = page.items.map((trace) => trace.traceId)
  if (traceIds.length === 0) {
    return {
      traceIds,
      sessionIds: [] as readonly SessionId[],
      traceRowCounts: {} as PurgedRowCounts,
      sessionRowCounts: {} as PurgedRowCounts,
    }
  }

  const sessionIds = yield* purge.listSessionIdsByTraceIds({ ...scope, traceIds })
  const postgres = yield* references.count({ projectId: request.projectId, traceIds, sessionIds })
  const traceRows = yield* purge.countTraceRows({ ...scope, traceIds })
  const sessionRows = yield* purge.countSessionRows({ ...scope, sessionIds })

  return {
    traceIds,
    sessionIds,
    traceRowCounts: mergeRowCounts(prefixCounts("postgres", postgres), prefixCounts("clickhouse", traceRows)),
    sessionRowCounts: prefixCounts("clickhouse", sessionRows),
  }
})

/**
 * Purges a prepared batch's traces. Postgres goes first and ClickHouse `traces` last,
 * so a batch that fails part-way is still listed, and still purgeable, on retry.
 */
export const purgeTraceDeletionBatchUseCase = Effect.fn("spans.purgeTraceDeletionBatch")(function* (input: {
  readonly requestId: TraceDeletionRequestId
  readonly projectId: ProjectId
  readonly traceIds: readonly TraceId[]
  readonly sessionIds: readonly SessionId[]
}) {
  yield* Effect.annotateCurrentSpan("traceDeletionRequest.id", input.requestId)
  const sqlClient = yield* SqlClient
  const purge = yield* TracePurgeRepository
  const { organizationId } = sqlClient

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      const references = yield* TraceReferencePurgeRepository
      const outboxEventWriter = yield* OutboxEventWriter
      const result = yield* references.purge(input)
      yield* outboxEventWriter
        .write({
          eventName: "TracesPurged",
          aggregateType: "trace_deletion_request",
          aggregateId: input.requestId,
          organizationId,
          payload: {
            organizationId,
            projectId: input.projectId,
            traceDeletionRequestId: input.requestId,
            traceIds: input.traceIds,
            deletedScores: result.scores,
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))
    }),
  )

  yield* purge.purgeTraces({ organizationId, projectId: input.projectId, traceIds: input.traceIds })
})

/** Runs after the batch's traces are gone, from the session keys the batch was prepared with. */
export const purgeTraceDeletionSessionsUseCase = Effect.fn("spans.purgeTraceDeletionSessions")(function* (input: {
  readonly projectId: ProjectId
  readonly sessionIds: readonly SessionId[]
}) {
  const sqlClient = yield* SqlClient
  const purge = yield* TracePurgeRepository
  return yield* purge.purgeSessions({
    organizationId: sqlClient.organizationId,
    projectId: input.projectId,
    sessionIds: input.sessionIds,
  })
})

export const finishTraceDeletionUseCase = Effect.fn("spans.finishTraceDeletion")(function* (input: {
  readonly requestId: TraceDeletionRequestId
  readonly matchedTraceCount: number
  readonly deletedRowCounts: PurgedRowCounts
  readonly error?: string | undefined
}) {
  yield* Effect.annotateCurrentSpan("traceDeletionRequest.id", input.requestId)
  const sqlClient = yield* SqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repository = yield* TraceDeletionRequestRepository
      const outboxEventWriter = yield* OutboxEventWriter
      const request = yield* repository.findById(input.requestId)
      if (isTraceDeletionFinished(request)) return request

      const finished =
        input.error === undefined
          ? markTraceDeletionCompleted(request, input)
          : markTraceDeletionFailed(request, { ...input, error: input.error })
      yield* repository.save(finished)
      yield* outboxEventWriter
        .write({
          eventName: "TraceDeletionRequestFinished",
          aggregateType: "trace_deletion_request",
          aggregateId: finished.id,
          organizationId: finished.organizationId,
          payload: {
            organizationId: finished.organizationId,
            projectId: finished.projectId,
            traceDeletionRequestId: finished.id,
            status: finished.status === "completed" ? "completed" : "failed",
            requestedBy: finished.requestedBy,
            matchedTraceCount: finished.matchedTraceCount,
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))
      return finished
    }),
  )
})
