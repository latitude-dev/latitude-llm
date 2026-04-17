import { ProjectId, type RepositoryError, SqlClient, TraceId } from "@domain/shared"
import { Effect } from "effect"

import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export interface MaterializeLiveQueueItemsInput {
  readonly projectId: string
  readonly traceId: string
  readonly traceCreatedAt: Date
  readonly queueIds: readonly string[]
}

export interface MaterializeLiveQueueItemsResult {
  readonly insertedItemCount: number
}

export type MaterializeLiveQueueItemsError = RepositoryError

export const materializeLiveQueueItemsUseCase = Effect.fn("annotationQueues.materializeLiveQueueItems")(function* (input: MaterializeLiveQueueItemsInput) {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("traceId", input.traceId)
    yield* Effect.annotateCurrentSpan("annotationQueues.queueCount", input.queueIds.length)

    if (input.queueIds.length === 0) {
      return {
        insertedItemCount: 0,
      } satisfies MaterializeLiveQueueItemsResult
    }

    const sqlClient = yield* SqlClient
    const queueRepository = yield* AnnotationQueueRepository
    const queueItemRepository = yield* AnnotationQueueItemRepository

    const insertedItemCount = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const { insertedQueueIds } = yield* queueItemRepository.insertManyAcrossQueues({
          projectId: ProjectId(input.projectId),
          traceId: TraceId(input.traceId),
          traceCreatedAt: input.traceCreatedAt,
          queueIds: input.queueIds,
        })

        yield* queueRepository.incrementTotalItemsMany({
          projectId: ProjectId(input.projectId),
          queueIds: insertedQueueIds,
        })

        return insertedQueueIds.length
      }),
    )

    return {
      insertedItemCount,
  } satisfies MaterializeLiveQueueItemsResult
})
