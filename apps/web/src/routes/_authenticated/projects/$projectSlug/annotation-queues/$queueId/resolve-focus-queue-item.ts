import type { AnnotationQueueItemListCursor } from "@domain/annotation-queues"
import { annotationQueueItemStatus } from "@domain/annotation-queues"
import { listAnnotationQueueItemsByQueue } from "../../../../../../domains/annotation-queue-items/annotation-queue-items.functions.ts"
import { ANNOTATION_QUEUE_ITEMS_PAGE_LIMIT } from "../../../../../../domains/annotation-queue-items/annotation-queue-items-pagination.ts"

const FOCUS_SORT_BY = "status" as const
const FOCUS_SORT_DIRECTION = "asc" as const

/**
 * Walks queue item pages (same sort as the queue list default) until the first
 * non-completed item is found, or the queue is exhausted.
 */
export async function resolveFirstNonCompletedQueueItemId(projectId: string, queueId: string): Promise<string | null> {
  let cursor: AnnotationQueueItemListCursor | undefined

  for (;;) {
    const page = await listAnnotationQueueItemsByQueue({
      data: {
        projectId,
        queueId,
        limit: ANNOTATION_QUEUE_ITEMS_PAGE_LIMIT,
        cursor,
        sortBy: FOCUS_SORT_BY,
        sortDirection: FOCUS_SORT_DIRECTION,
      },
    })

    const first = page.items.find((row) => annotationQueueItemStatus(row) !== "completed")
    if (first) return first.id

    if (!page.hasMore || !page.nextCursor) return null
    cursor = page.nextCursor
  }
}
