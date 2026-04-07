import { type AnnotationQueueItemStatus, annotationQueueItemStatus } from "@domain/annotation-queues"
import { Badge, type BadgeProps } from "@repo/ui"
import type { AnnotationQueueItemRecord } from "../../../../../../domains/annotation-queue-items/annotation-queue-items.functions.ts"

const STATUS_LABEL: Record<AnnotationQueueItemStatus, string> = {
  pending: "Pending",
  inProgress: "In progress",
  completed: "Completed",
}

const STATUS_VARIANT: Record<AnnotationQueueItemStatus, NonNullable<BadgeProps["variant"]>> = {
  pending: "outlineMuted",
  inProgress: "yellow",
  completed: "success",
}

export function QueueItemStatusBadge({
  row,
}: {
  readonly row: Pick<AnnotationQueueItemRecord, "completedAt" | "reviewStartedAt">
}) {
  const status = annotationQueueItemStatus(row)
  return (
    <Badge variant={STATUS_VARIANT[status]} size="small" noWrap>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
