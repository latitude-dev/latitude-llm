import type { IncidentNotificationPayload } from "@domain/notifications"
import { Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../../base-notification.tsx"

export function IssueEscalatingNotification({
  notification,
  payload,
}: {
  readonly notification: NotificationRecord
  readonly payload: IncidentNotificationPayload
}) {
  const createdAt = new Date(notification.createdAt)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const opened = payload.event === "opened"

  return (
    <BaseNotification
      seenAt={seenAt}
      icon={
        opened ? (
          <TrendingUpIcon className="h-4 w-4 text-warning" />
        ) : (
          <TrendingDownIcon className="h-4 w-4 text-foreground-muted" />
        )
      }
      title={opened ? "Issue started escalating" : "Issue stopped escalating"}
      description={
        opened
          ? "Recent occurrences crossed the escalation threshold."
          : "Occurrence rate dropped back below the threshold."
      }
    >
      <Text.H6 color="foregroundMuted">{relativeTime(createdAt)}</Text.H6>
    </BaseNotification>
  )
}
