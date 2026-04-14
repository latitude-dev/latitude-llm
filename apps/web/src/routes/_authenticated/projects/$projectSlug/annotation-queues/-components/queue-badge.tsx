import { isLiveQueue, isSystemQueue } from "@domain/annotation-queues"
import { Badge, LatitudeLogo, Status, Tooltip } from "@repo/ui"
import type { AnnotationQueueRecord } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"

export function QueueBadge({ queue }: { readonly queue: AnnotationQueueRecord }) {
  if (isLiveQueue(queue.settings)) {
    return (
      <Tooltip asChild trigger={<Status variant="success" label="LIVE" />}>
        We will add new traces that match this queue automatically
      </Tooltip>
    )
  }

  if (isSystemQueue(queue)) {
    return (
      <Tooltip
        asChild
        trigger={
          <Badge variant="outline" size="small" centered>
            <LatitudeLogo className="h-3 w-3 shrink-0" />
          </Badge>
        }
      >
        We will add new traces that match this system-created queue automatically
      </Tooltip>
    )
  }

  return null
}
