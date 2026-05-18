import { wrappedReportPayloadSchema } from "@domain/notifications"
import { ClaudeCodeIcon, Icon, Text } from "@repo/ui"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../base-notification.tsx"

/**
 * Renders a Claude Code Wrapped notification — broadcast to every org
 * member when the per-project pipeline finishes a run. The payload
 * carries the absolute URL to the public report page; the row's
 * `projectId` is the anchor the bell uses to surface the project name
 * (resolved live by `BaseNotification`).
 */
export function WrappedReportNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = wrappedReportPayloadSchema.safeParse(notification.payload)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)

  if (!parsed.success) {
    return (
      <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  const { link } = parsed.data

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<Icon icon={ClaudeCodeIcon} className="h-5 w-5 text-foreground-muted" />}
      title="Your Claude Code Wrapped is ready"
      description="Click here to see it"
      url={link}
    />
  )
}
