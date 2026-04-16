import type { ProjectId, RepositoryError } from "@domain/shared"
import { Data, Effect } from "effect"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export class DeleteQueueNotFoundError extends Data.TaggedError("DeleteQueueNotFoundError")<{
  readonly queueId: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return "Annotation queue not found"
  }
}

export class SystemQueueDeleteForbiddenError extends Data.TaggedError("SystemQueueDeleteForbiddenError")<{
  readonly queueId: string
}> {
  readonly httpStatus = 403
  get httpMessage() {
    return "System queues cannot be deleted"
  }
}

export interface DeleteQueueInput {
  readonly projectId: ProjectId
  readonly queueId: string
}

export interface DeleteQueueResult {
  readonly queue: AnnotationQueue
}

export type DeleteQueueError = RepositoryError | DeleteQueueNotFoundError | SystemQueueDeleteForbiddenError

export const deleteQueueUseCase = (
  input: DeleteQueueInput,
): Effect.Effect<DeleteQueueResult, DeleteQueueError, AnnotationQueueRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("queue.id", input.queueId)
    yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)

    const repo = yield* AnnotationQueueRepository

    const existing = yield* repo.findByIdInProject({
      projectId: input.projectId,
      queueId: input.queueId,
    })

    if (!existing) {
      return yield* new DeleteQueueNotFoundError({ queueId: input.queueId })
    }

    if (existing.system) {
      return yield* new SystemQueueDeleteForbiddenError({ queueId: input.queueId })
    }

    const now = new Date()
    const deleted: AnnotationQueue = {
      ...existing,
      assignees: [...existing.assignees],
      deletedAt: now,
      updatedAt: now,
    }

    const saved = yield* repo.save(deleted)

    return { queue: saved }
  }).pipe(Effect.withSpan("annotationQueues.deleteQueue"))
