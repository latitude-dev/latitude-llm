import {
  generateSlug,
  type InvalidSlugInputError,
  type ProjectId,
  type RepositoryError,
  type SqlClient,
  toSlug,
} from "@domain/shared"
import { Data, Effect } from "effect"
import {
  type AnnotationQueue,
  type AnnotationQueueSettings,
  normalizeQueueSettings,
} from "../entities/annotation-queue.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export class QueueNotFoundError extends Data.TaggedError("QueueNotFoundError")<{
  readonly queueId: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return "Annotation queue not found"
  }
}

export interface UpdateQueueInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly name?: string
  readonly description: string
  readonly instructions: string
  readonly assignees?: readonly string[]
  readonly settings?: Partial<AnnotationQueueSettings>
}

export interface UpdateQueueResult {
  readonly queue: AnnotationQueue
}

export type UpdateQueueError = RepositoryError | QueueNotFoundError | InvalidSlugInputError

export const updateQueueUseCase = (
  input: UpdateQueueInput,
): Effect.Effect<UpdateQueueResult, UpdateQueueError, AnnotationQueueRepository | SqlClient> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("queue.id", input.queueId)
    yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)

    const repo = yield* AnnotationQueueRepository

    const existing = yield* repo.findByIdInProject({
      projectId: input.projectId,
      queueId: input.queueId,
    })

    if (!existing) {
      return yield* new QueueNotFoundError({ queueId: input.queueId })
    }

    const now = new Date()
    let updated: AnnotationQueue

    if (existing.system) {
      const mergedSettings: AnnotationQueueSettings = {
        ...existing.settings,
        ...(input.settings?.sampling !== undefined ? { sampling: input.settings.sampling } : {}),
      }
      const normalizedSettings = normalizeQueueSettings(mergedSettings)

      updated = {
        ...existing,
        settings: normalizedSettings,
        updatedAt: now,
      }
    } else {
      const newName = input.name
      const nameChanged = newName !== undefined && newName !== existing.name
      // Slug regenerates only when the name change actually affects the slug
      // form (e.g. capitalization-only edits keep the slug stable so URLs
      // don't churn).
      const newSlug =
        nameChanged && toSlug(newName) !== existing.slug
          ? yield* generateSlug({
              name: newName,
              count: (slug) => repo.countBySlug({ projectId: input.projectId, slug, excludeQueueId: existing.id }),
            })
          : existing.slug

      const mergedSettings: AnnotationQueueSettings = {
        ...existing.settings,
        ...(input.settings?.filter !== undefined ? { filter: input.settings.filter } : {}),
        ...(input.settings?.sampling !== undefined ? { sampling: input.settings.sampling } : {}),
      }
      const normalizedSettings = normalizeQueueSettings(mergedSettings)

      updated = {
        ...existing,
        name: input.name ?? existing.name,
        slug: newSlug,
        description: input.description ?? existing.description,
        instructions: input.instructions ?? existing.instructions,
        assignees: input.assignees ? [...input.assignees] : [...existing.assignees],
        settings: normalizedSettings,
        updatedAt: now,
      }
    }

    const saved = yield* repo.save(updated)

    return { queue: saved }
  }).pipe(Effect.withSpan("annotationQueues.updateQueue"))
