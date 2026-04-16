import { listTraceAnnotationsUseCase } from "@domain/annotations"
import type { Score } from "@domain/scores"
import { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"

export interface MarkReviewStartedInput {
  readonly score: Score
}

/**
 * Marks all pending annotation queue items containing the given trace as "in progress".
 * Only marks if this is the first annotation for the trace.
 *
 * Since this runs asynchronously via worker after the annotation is persisted,
 * we check for `count > 1` (the just-created annotation is already counted).
 *
 * Skips if the score is not an annotation or has no traceId.
 */
export const markReviewStartedUseCase = (input: MarkReviewStartedInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("score.id", input.score.id)
    yield* Effect.annotateCurrentSpan("score.projectId", input.score.projectId)

    const { score } = input

    if (score.source !== "annotation") return 0
    if (!score.traceId) return 0

    const projectId = ProjectId(score.projectId)
    const traceId = score.traceId

    const existingAnnotations = yield* listTraceAnnotationsUseCase({
      projectId: projectId as unknown as string,
      traceId,
      limit: 2,
      draftMode: "include",
    })

    if (existingAnnotations.items.length > 1) {
      return 0
    }

    const itemRepo = yield* AnnotationQueueItemRepository

    const items = yield* itemRepo.listByTraceId({
      projectId,
      traceId,
    })

    const pendingItems = items.filter((item) => item.completedAt === null && item.reviewStartedAt === null)

    if (pendingItems.length === 0) {
      return 0
    }

    const now = new Date()

    yield* Effect.forEach(
      pendingItems,
      (item) =>
        itemRepo.update({
          projectId,
          queueId: item.queueId,
          itemId: item.id,
          reviewStartedAt: now,
        }),
      { concurrency: "unbounded" },
    )

    return pendingItems.length
  }).pipe(Effect.withSpan("annotationQueues.markReviewStarted"))
