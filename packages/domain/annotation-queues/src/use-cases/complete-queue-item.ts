import { OutboxEventWriter } from "@domain/events"
import { type ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { QueueItemAlreadyCompletedError, QueueItemNotFoundError } from "../errors.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export interface CompleteQueueItemInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly itemId: string
  readonly userId: string
}

export type CompleteQueueItemError = RepositoryError | QueueItemNotFoundError | QueueItemAlreadyCompletedError

export const completeQueueItemUseCase = Effect.fn("annotationQueues.completeQueueItem")(function* (input: CompleteQueueItemInput) {
    yield* Effect.annotateCurrentSpan("queue.id", input.queueId)
    yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("queue.itemId", input.itemId)

    const sqlClient = yield* SqlClient
    const itemRepo = yield* AnnotationQueueItemRepository
    const queueRepo = yield* AnnotationQueueRepository

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const item = yield* itemRepo.findById({
          projectId: input.projectId,
          queueId: input.queueId,
          itemId: input.itemId,
        })

        if (!item) {
          return yield* new QueueItemNotFoundError({ itemId: input.itemId })
        }

        if (item.completedAt) {
          return yield* new QueueItemAlreadyCompletedError({ itemId: input.itemId })
        }

        const updated = yield* itemRepo.update({
          projectId: input.projectId,
          queueId: input.queueId,
          itemId: input.itemId,
          completedAt: new Date(),
          completedBy: input.userId,
        })

        yield* queueRepo.incrementCompletedItems({
          projectId: input.projectId,
          queueId: input.queueId,
          delta: 1,
        })

        const outboxEventWriter = yield* OutboxEventWriter
        yield* outboxEventWriter.write({
          eventName: "AnnotationQueueItemCompleted",
          aggregateType: "annotation_queue_item",
          aggregateId: input.itemId,
          organizationId: sqlClient.organizationId,
          payload: {
            organizationId: sqlClient.organizationId,
            actorUserId: input.userId,
            projectId: input.projectId,
            queueId: input.queueId,
            itemId: input.itemId,
          },
        })

        return updated
      }),
    )
  })
