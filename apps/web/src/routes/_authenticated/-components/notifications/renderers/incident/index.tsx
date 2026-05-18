import { type IncidentOpenedPayload, incidentOpenedPayloadSchema, type NotificationKind } from "@domain/notifications"
import { Text } from "@repo/ui"
import type { ComponentType } from "react"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../../base-notification.tsx"
import { IssueEscalatingNotification } from "./issue-escalating.tsx"
import { IssueNewNotification } from "./issue-new.tsx"
import { IssueRegressedNotification } from "./issue-regressed.tsx"

export type IncidentEvent = "opened" | "closed"

const eventFromKind = (kind: NotificationKind): IncidentEvent | null =>
  kind === "incident.opened" ? "opened" : kind === "incident.closed" ? "closed" : null

export type IncidentRendererProps = {
  readonly notification: NotificationRecord
  readonly payload: IncidentOpenedPayload
  readonly event: IncidentEvent
}

const RENDERERS_BY_KIND: Record<IncidentOpenedPayload["incidentKind"], ComponentType<IncidentRendererProps>> = {
  "issue.new": IssueNewNotification,
  "issue.regressed": IssueRegressedNotification,
  "issue.escalating": IssueEscalatingNotification,
}

export function IncidentNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = incidentOpenedPayloadSchema.safeParse(notification.payload)
  const event = eventFromKind(notification.kind)
  if (!parsed.success || event === null) {
    const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
    const createdAt = new Date(notification.createdAt)
    return (
      <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  const Renderer = RENDERERS_BY_KIND[parsed.data.incidentKind]
  return <Renderer notification={notification} payload={parsed.data} event={event} />
}
