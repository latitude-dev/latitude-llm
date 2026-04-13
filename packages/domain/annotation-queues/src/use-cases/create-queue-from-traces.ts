import {
  type AnnotationQueueId,
  ChSqlClient,
  type ConcurrentSqlTransactionError,
  generateId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  toSlug,
} from "@domain/shared"
import type { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import type { TooManyTracesSelectedError } from "../errors.ts"
import { resolveQueueItems, type TraceSelection } from "../helpers/bulk-create-from-traces-helpers.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export type CreateQueueFromTracesError = TooManyTracesSelectedError | RepositoryError | ConcurrentSqlTransactionError

export function createQueueFromTraces(args: {
  readonly projectId: ProjectId
  readonly name: string
  readonly selection: TraceSelection
}): Effect.Effect<
  { queueId: AnnotationQueueId; insertedCount: number },
  CreateQueueFromTracesError,
  SqlClient | ChSqlClient | TraceRepository | AnnotationQueueItemRepository | AnnotationQueueRepository
> {
  return Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    const chSqlClient = yield* ChSqlClient

    const items = yield* resolveQueueItems({
      projectId: args.projectId,
      selection: args.selection,
    })

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const queueRepository = yield* AnnotationQueueRepository
        const itemRepository = yield* AnnotationQueueItemRepository

        const now = new Date()
        const queueId = generateId<"AnnotationQueueId">()
        const queue: AnnotationQueue = {
          id: queueId,
          organizationId: chSqlClient.organizationId,
          projectId: args.projectId,
          system: false,
          name: args.name,
          slug: toSlug(args.name),
          description: "",
          instructions: "",
          settings: {},
          assignees: [],
          totalItems: 0,
          completedItems: 0,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        }

        yield* queueRepository.save(queue)

        if (items.length === 0) {
          return { queueId, insertedCount: 0 }
        }

        const { insertedCount } = yield* itemRepository.bulkInsertIfNotExists({
          projectId: args.projectId,
          queueId,
          items,
        })

        if (insertedCount > 0) {
          yield* queueRepository.incrementTotalItems({
            projectId: args.projectId,
            queueId,
            delta: insertedCount,
          })
        }

        return { queueId, insertedCount }
      }),
    )
  })
}
