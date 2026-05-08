import type { IncidentNotificationPayload } from "@domain/notifications"
import { Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { SparklesIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../../base-notification.tsx"

export function IssueNewNotification({
  notification,
  payload: _payload,
}: {
  readonly notification: NotificationRecord
  readonly payload: IncidentNotificationPayload
}) {
  const createdAt = new Date(notification.createdAt)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined

  return (
    <BaseNotification
      seenAt={seenAt}
      icon={<SparklesIcon className="h-4 w-4 text-foreground-muted" />}
      title="New issue detected"
      description="An evaluation flagged a new failure pattern in this project."
    >
      <Text.H6 color="foregroundMuted">{relativeTime(createdAt)}</Text.H6>
    </BaseNotification>
  )
}
