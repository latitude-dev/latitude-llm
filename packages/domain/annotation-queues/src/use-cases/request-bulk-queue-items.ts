import { type QueuePublishError, QueuePublisher } from "@domain/queue"
import {
  type AnnotationQueueId,
  BadRequestError,
  ChSqlClient,
  type ConcurrentSqlTransactionError,
  generateId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  toSlug,
} from "@domain/shared"
import { Effect } from "effect"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import type { TraceSelection } from "../helpers/bulk-create-from-traces-helpers.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export type RequestBulkQueueItemsError =
  | RepositoryError
  | ConcurrentSqlTransactionError
  | BadRequestError
  | QueuePublishError

export type RequestBulkQueueItemsInput =
  | {
      readonly projectId: ProjectId
      readonly queueId: AnnotationQueueId
      readonly selection: TraceSelection
    }
  | {
      readonly projectId: ProjectId
      readonly newQueueName: string
      readonly selection: TraceSelection
    }

function serializeSelection(selection: TraceSelection) {
  if (selection.mode === "selected") {
    return { mode: "selected" as const, traceIds: selection.traceIds as readonly string[] }
  }
  if (selection.mode === "all") {
    return {
      mode: "all" as const,
      ...(selection.filters ? { filters: selection.filters as Record<string, unknown> } : {}),
    }
  }
  return {
    mode: "allExcept" as const,
    traceIds: selection.traceIds as readonly string[],
    ...(selection.filters ? { filters: selection.filters as Record<string, unknown> } : {}),
  }
}

export function requestBulkQueueItems(
  args: RequestBulkQueueItemsInput,
): Effect.Effect<
  { queueId: AnnotationQueueId },
  RequestBulkQueueItemsError,
  SqlClient | ChSqlClient | QueuePublisher | AnnotationQueueRepository
> {
  return Effect.gen(function* () {
    const chSqlClient = yield* ChSqlClient
    const queueRepository = yield* AnnotationQueueRepository
    const queuePublisher = yield* QueuePublisher

    let queueId: AnnotationQueueId

    if ("queueId" in args) {
      const existingQueue = yield* queueRepository.findByIdInProject({
        projectId: args.projectId,
        queueId: args.queueId,
      })

      if (!existingQueue) {
        return yield* new BadRequestError({ message: `Queue ${args.queueId} not found` })
      }

      queueId = args.queueId
    } else {
      const sqlClient = yield* SqlClient

      queueId = yield* sqlClient.transaction(
        Effect.gen(function* () {
          const now = new Date()
          const newQueueId = generateId<"AnnotationQueueId">()
          const queue: AnnotationQueue = {
            id: newQueueId,
            organizationId: chSqlClient.organizationId,
            projectId: args.projectId,
            system: false,
            name: args.newQueueName,
            slug: toSlug(args.newQueueName),
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

          return newQueueId
        }),
      )
    }

    yield* queuePublisher.publish("annotation-queues", "bulkImport", {
      organizationId: chSqlClient.organizationId,
      projectId: args.projectId,
      queueId,
      selection: serializeSelection(args.selection),
    })

    return { queueId }
  })
}
