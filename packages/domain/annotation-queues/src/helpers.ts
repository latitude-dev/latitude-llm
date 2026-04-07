import type { AnnotationQueueItemStatus } from "./entities/annotation-queue-items.ts"

function coalesceInstant(v: Date | string | null | undefined): Date | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Accepts entity dates or ISO strings (e.g. from API records). */
export function annotationQueueItemStatus(item: {
  completedAt: Date | string | null | undefined
  reviewStartedAt: Date | string | null | undefined
}): AnnotationQueueItemStatus {
  if (coalesceInstant(item.completedAt)) return "completed"
  if (coalesceInstant(item.reviewStartedAt)) return "inProgress"
  return "pending"
}

/** Status tier for sorting and keyset cursors: pending (0) → in progress (1) → completed (2). */
type AnnotationQueueItemStatusRank = 0 | 1 | 2
export function annotationQueueItemStatusRankFromTimestamps(
  completedAt: Date | null,
  reviewStartedAt: Date | null,
): AnnotationQueueItemStatusRank {
  if (completedAt) return 2
  if (reviewStartedAt) return 1
  return 0
}
