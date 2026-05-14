import { wrappedReportNotificationPayloadSchema } from "@domain/notifications"
import { ClaudeCodeIcon, Icon, Text } from "@repo/ui"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../base-notification.tsx"

/**
 * Renders a Claude Code Wrapped notification — broadcast to every org
 * member when the per-project pipeline finishes a run. The persisted
 * Wrapped row id is the notification's `sourceId`; the payload carries
 * only the project name and the absolute URL to the public report page.
 */
export function WrappedReportNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = wrappedReportNotificationPayloadSchema.safeParse(notification.payload)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)

  if (!parsed.success) {
    return (
      <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  const { projectName, link } = parsed.data
  const title = `Your Claude Code Wrapped for ${projectName} is ready`
  const description = "Click here to see it"

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      icon={<Icon icon={ClaudeCodeIcon} className="h-5 w-5 text-foreground-muted" />}
      title={title}
      description={description}
      url={link}
    />
  )
}
