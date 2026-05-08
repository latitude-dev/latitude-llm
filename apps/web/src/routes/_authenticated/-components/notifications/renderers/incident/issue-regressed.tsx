import type { IncidentNotificationPayload } from "@domain/notifications"
import { Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { ArrowDownRightIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../../base-notification.tsx"

export function IssueRegressedNotification({
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
      icon={<ArrowDownRightIcon className="h-4 w-4 text-destructive" />}
      title="Issue regressed"
      description="A resolved issue is producing failures again."
    >
      <Text.H6 color="foregroundMuted">{relativeTime(createdAt)}</Text.H6>
    </BaseNotification>
  )
}
