import { incidentNotificationPayloadSchema } from "@domain/notifications"
import { Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"

const TITLE_BY_KIND_AND_EVENT: Record<string, Record<"opened" | "closed", string>> = {
  "issue.new": { opened: "New issue detected", closed: "" },
  "issue.regressed": { opened: "Issue regressed", closed: "" },
  "issue.escalating": { opened: "Issue started escalating", closed: "Issue stopped escalating" },
}

export function IncidentNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = incidentNotificationPayloadSchema.safeParse(notification.payload)
  if (!parsed.success) {
    return (
      <div className="px-3 py-2">
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </div>
    )
  }

  const title = TITLE_BY_KIND_AND_EVENT[parsed.data.incidentKind]?.[parsed.data.event] ?? "Alert update"
  const createdAt = new Date(notification.createdAt)

  return (
    <div className="px-3 py-2">
      <Text.H5>{title}</Text.H5>
      <Text.H6 color="foregroundMuted">{relativeTime(createdAt)}</Text.H6>
    </div>
  )
}
