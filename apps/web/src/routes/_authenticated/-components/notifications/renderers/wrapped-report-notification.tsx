import { wrappedReportNotificationPayloadSchema } from "@domain/notifications"
import { ClaudeCodeIcon, Icon, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
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

  if (!parsed.success) {
    return (
      <BaseNotification seenAt={seenAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  const { projectName, link } = parsed.data
  const title = `Your Claude Code Wrapped for ${projectName} is ready`
  const description = "Click here to see it"
  const createdAt = new Date(notification.createdAt)

  return (
    <BaseNotification
      seenAt={seenAt}
      icon={<Icon icon={ClaudeCodeIcon} className="h-5 w-5 text-foreground-muted" />}
      title={title}
      description={description}
      url={link}
    >
      <Text.H6 color="foregroundMuted">{relativeTime(createdAt)}</Text.H6>
    </BaseNotification>
  )
}
