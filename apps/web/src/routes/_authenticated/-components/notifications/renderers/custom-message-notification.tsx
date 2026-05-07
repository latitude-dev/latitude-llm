import { customMessageNotificationPayloadSchema } from "@domain/notifications"
import { Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"

export function CustomMessageNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = customMessageNotificationPayloadSchema.safeParse(notification.payload)
  if (!parsed.success) {
    return (
      <div className="px-3 py-2">
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </div>
    )
  }
  const createdAt = new Date(notification.createdAt)

  return (
    <div className="px-3 py-2">
      <Text.H5>{parsed.data.title}</Text.H5>
      <Text.H6 color="foregroundMuted">{parsed.data.content}</Text.H6>
      <Text.H6 color="foregroundMuted">{relativeTime(createdAt)}</Text.H6>
    </div>
  )
}
