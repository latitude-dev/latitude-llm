import { type QueuePublishError, QueuePublisher } from "@domain/queue"
import {
  type AnnotationQueueId,
  BadRequestError,
  ChSqlClient,
  type ProjectId,
  type RepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import type { AnnotationQueueSettings } from "../entities/annotation-queue.ts"
import type { TraceSelection } from "../helpers/bulk-create-from-traces-helpers.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { type CreateQueueError, createQueueUseCase } from "./create-queue.ts"

export interface NewQueueInput {
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly assignees?: readonly string[]
  readonly settings?: AnnotationQueueSettings
}

export type RequestBulkQueueItemsError = RepositoryError | CreateQueueError | BadRequestError | QueuePublishError

export type RequestBulkQueueItemsInput =
  | {
      readonly projectId: ProjectId
      readonly queueId: AnnotationQueueId
      readonly selection: TraceSelection
    }
  | {
      readonly projectId: ProjectId
      readonly newQueue: NewQueueInput
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
  ChSqlClient | QueuePublisher | AnnotationQueueRepository
> {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("queue.projectId", args.projectId)
    if ("queueId" in args) {
      yield* Effect.annotateCurrentSpan("queue.id", args.queueId)
    }

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
      const { newQueue } = args
      const result = yield* createQueueUseCase({
        organizationId: chSqlClient.organizationId,
        projectId: args.projectId,
        name: newQueue.name,
        description: newQueue.description,
        instructions: newQueue.instructions,
        ...(newQueue.assignees !== undefined ? { assignees: newQueue.assignees } : {}),
        ...(newQueue.settings !== undefined ? { settings: newQueue.settings } : {}),
      })

      queueId = result.queue.id as AnnotationQueueId
    }

    yield* queuePublisher.publish("annotation-queues", "bulkImport", {
      organizationId: chSqlClient.organizationId,
      projectId: args.projectId,
      queueId,
      selection: serializeSelection(args.selection),
    })

    return { queueId }
  }).pipe(Effect.withSpan("annotationQueues.requestBulkQueueItems"))
}
