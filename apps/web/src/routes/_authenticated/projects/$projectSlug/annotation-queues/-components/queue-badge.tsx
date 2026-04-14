import { isLiveQueue, isSystemQueue } from "@domain/annotation-queues"
import { Badge, LatitudeLogo, Status, Tooltip } from "@repo/ui"
import type { AnnotationQueueRecord } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"

const SYSTEM_QUEUE_TOOLTIP =
  "Provisioned by Latitude. Traces join when the system flags a match and validation succeeds. Name and reviewer instructions stay fixed."

const LIVE_QUEUE_TOOLTIP =
  "Live queue: when traces finish, new items are added automatically if they match this queue's filter and sampling."

export function QueueBadge({ queue }: { readonly queue: AnnotationQueueRecord }) {
  if (isLiveQueue(queue.settings)) {
    return (
      <Tooltip asChild trigger={<Status variant="success" label="LIVE" />}>
        {LIVE_QUEUE_TOOLTIP}
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
        {SYSTEM_QUEUE_TOOLTIP}
      </Tooltip>
    )
  }

  return null
}
