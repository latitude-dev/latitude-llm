import { type AnnotationQueueItemStatus, annotationQueueItemStatus } from "@domain/annotation-queues"
import { Status, type StatusProps } from "@repo/ui"
import type { AnnotationQueueItemRecord } from "../../../../../../domains/annotation-queue-items/annotation-queue-items.functions.ts"

const STATUS_LABEL: Record<AnnotationQueueItemStatus, string> = {
  pending: "Pending",
  inProgress: "In progress",
  completed: "Completed",
}

const STATUS_VARIANT: Record<AnnotationQueueItemStatus, NonNullable<StatusProps["variant"]>> = {
  pending: "neutral",
  inProgress: "warning",
  completed: "success",
}

export function QueueItemStatusBadge({
  row,
}: {
  readonly row: Pick<AnnotationQueueItemRecord, "completedAt" | "reviewStartedAt">
}) {
  const status = annotationQueueItemStatus(row)
  return <Status variant={STATUS_VARIANT[status]} label={STATUS_LABEL[status]} />
}
