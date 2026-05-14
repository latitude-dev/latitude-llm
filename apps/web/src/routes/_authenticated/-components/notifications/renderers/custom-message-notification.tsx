import { customMessageNotificationPayloadSchema } from "@domain/notifications"
import { Icon, Text } from "@repo/ui"
import { ExternalLinkIcon, MessageCircleIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../base-notification.tsx"

export function CustomMessageNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = customMessageNotificationPayloadSchema.safeParse(notification.payload)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)

  if (!parsed.success) {
    return (
      <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      icon={
        <Icon
          icon={parsed.data.link ? ExternalLinkIcon : MessageCircleIcon}
          className="h-4 w-4 text-foreground-muted"
        />
      }
      title={parsed.data.title}
      description={parsed.data.content}
      {...(parsed.data.link ? { url: parsed.data.link } : {})}
    />
  )
}
