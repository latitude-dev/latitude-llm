import { customMessageNotificationPayloadSchema } from "@domain/notifications"
import { Icon, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { ExternalLinkIcon, MessageCircleIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../base-notification.tsx"

export function CustomMessageNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = customMessageNotificationPayloadSchema.safeParse(notification.payload)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined

  if (!parsed.success) {
    return (
      <BaseNotification seenAt={seenAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }
  const createdAt = new Date(notification.createdAt)

  return (
    <BaseNotification
      seenAt={seenAt}
      icon={
        <Icon
          icon={parsed.data.link ? ExternalLinkIcon : MessageCircleIcon}
          className="h-4 w-4 text-foreground-muted"
        />
      }
      title={parsed.data.title}
      description={parsed.data.content}
      {...(parsed.data.link ? { url: parsed.data.link } : {})}
    >
      <Text.H6 color="foregroundMuted">{relativeTime(createdAt)}</Text.H6>
    </BaseNotification>
  )
}
