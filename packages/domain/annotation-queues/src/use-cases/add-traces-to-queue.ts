import {
  type AnnotationQueueId,
  type ChSqlClient,
  type ConcurrentSqlTransactionError,
  type ProjectId,
  type RepositoryError,
  SqlClient,
} from "@domain/shared"
import type { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { TooManyTracesSelectedError } from "../errors.ts"
import { resolveQueueItems, type TraceSelection } from "../helpers/bulk-create-from-traces-helpers.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export type AddTracesToQueueError = TooManyTracesSelectedError | RepositoryError | ConcurrentSqlTransactionError

export function addTracesToQueue(args: {
  readonly projectId: ProjectId
  readonly queueId: AnnotationQueueId
  readonly selection: TraceSelection
}): Effect.Effect<
  { insertedCount: number },
  AddTracesToQueueError,
  SqlClient | ChSqlClient | TraceRepository | AnnotationQueueItemRepository | AnnotationQueueRepository
> {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("queue.id", args.queueId)
    yield* Effect.annotateCurrentSpan("queue.projectId", args.projectId)

    const items = yield* resolveQueueItems({
      projectId: args.projectId,
      selection: args.selection,
    })

    if (items.length === 0) {
      return { insertedCount: 0 }
    }

    const sqlClient = yield* SqlClient
    const itemRepository = yield* AnnotationQueueItemRepository
    const queueRepository = yield* AnnotationQueueRepository

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const { insertedCount } = yield* itemRepository.bulkInsertIfNotExists({
          projectId: args.projectId,
          queueId: args.queueId,
          items,
        })

        if (insertedCount > 0) {
          yield* queueRepository.incrementTotalItems({
            projectId: args.projectId,
            queueId: args.queueId,
            delta: insertedCount,
          })
        }

        return { insertedCount }
      }),
    )
  }).pipe(Effect.withSpan("annotationQueues.addTracesToQueue"))
}
