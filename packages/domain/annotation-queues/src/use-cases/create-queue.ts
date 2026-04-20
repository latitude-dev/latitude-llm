import { type ProjectId, type RepositoryError, toSlug } from "@domain/shared"
import { Effect } from "effect"
import { LIVE_QUEUE_DEFAULT_SAMPLING } from "../constants.ts"
import {
  type AnnotationQueue,
  type AnnotationQueueSettings,
  normalizeQueueSettings,
} from "../entities/annotation-queue.ts"
import { AnnotationQueueRepository, type SaveQueueInput } from "../ports/annotation-queue-repository.ts"

export interface CreateQueueInput {
  readonly organizationId: string
  readonly projectId: ProjectId
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly assignees?: readonly string[]
  readonly settings?: AnnotationQueueSettings
}

export interface CreateQueueResult {
  readonly queue: AnnotationQueue
}

export type CreateQueueError = RepositoryError

export const createQueueUseCase = (
  input: CreateQueueInput,
): Effect.Effect<CreateQueueResult, CreateQueueError, AnnotationQueueRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("queue.organizationId", input.organizationId)

    const repo = yield* AnnotationQueueRepository

    const now = new Date()
    const slug = toSlug(input.name)

    const rawSettings: AnnotationQueueSettings = input.settings ?? {}
    const normalizedSettings = normalizeQueueSettings(rawSettings)

    const hasFilter = normalizedSettings.filter !== undefined
    const sampling = normalizedSettings.sampling ?? (hasFilter ? LIVE_QUEUE_DEFAULT_SAMPLING : undefined)

    const finalSettings: AnnotationQueueSettings = {
      ...normalizedSettings,
      ...(sampling !== undefined ? { sampling } : {}),
    }

    const queueData: SaveQueueInput = {
      organizationId: input.organizationId,
      projectId: input.projectId,
      system: false,
      name: input.name,
      slug,
      description: input.description,
      instructions: input.instructions,
      settings: finalSettings,
      assignees: [...(input.assignees ?? [])],
      totalItems: 0,
      completedItems: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    const queue = yield* repo.save(queueData)

    return { queue }
  }).pipe(Effect.withSpan("annotationQueues.createQueue"))
