import { type ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { QueueItemNotCompletedError, QueueItemNotFoundError } from "../errors.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export interface UncompleteQueueItemInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly itemId: string
}

export type UncompleteQueueItemError = RepositoryError | QueueItemNotFoundError | QueueItemNotCompletedError

export const uncompleteQueueItemUseCase = (input: UncompleteQueueItemInput) =>
  Effect.gen(function* () {
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

        if (!item.completedAt) {
          return yield* new QueueItemNotCompletedError({ itemId: input.itemId })
        }

        const updated = yield* itemRepo.update({
          projectId: input.projectId,
          queueId: input.queueId,
          itemId: input.itemId,
          completedAt: null,
          completedBy: null,
        })

        yield* queueRepo.incrementCompletedItems({
          projectId: input.projectId,
          queueId: input.queueId,
          delta: -1,
        })

        return updated
      }),
    )
  })
