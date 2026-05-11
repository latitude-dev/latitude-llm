import { incidentNotificationPayloadSchema } from "@domain/notifications"
import { Text } from "@repo/ui"
import type { ComponentType } from "react"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../../base-notification.tsx"
import { IssueEscalatingNotification } from "./issue-escalating.tsx"
import { IssueNewNotification } from "./issue-new.tsx"
import { IssueRegressedNotification } from "./issue-regressed.tsx"

type IncidentRendererProps = {
  readonly notification: NotificationRecord
  readonly payload: import("@domain/notifications").IncidentNotificationPayload
}

const RENDERERS_BY_KIND: Record<
  import("@domain/notifications").IncidentNotificationPayload["incidentKind"],
  ComponentType<IncidentRendererProps>
> = {
  "issue.new": IssueNewNotification,
  "issue.regressed": IssueRegressedNotification,
  "issue.escalating": IssueEscalatingNotification,
}

export function IncidentNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = incidentNotificationPayloadSchema.safeParse(notification.payload)
  if (!parsed.success) {
    const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
    return (
      <BaseNotification seenAt={seenAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  const Renderer = RENDERERS_BY_KIND[parsed.data.incidentKind]
  return <Renderer notification={notification} payload={parsed.data} />
}
