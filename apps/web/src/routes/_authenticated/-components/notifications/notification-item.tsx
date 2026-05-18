import type { NotificationKind } from "@domain/notifications"
import type { ComponentType } from "react"
import type { NotificationRecord } from "../../../../domains/notifications/notifications.functions.ts"
import { CustomMessageNotification } from "./renderers/custom-message-notification.tsx"
import { IncidentNotification } from "./renderers/incident/index.tsx"
import { WrappedReportNotification } from "./renderers/wrapped-report-notification.tsx"

const RENDERERS: Record<NotificationKind, ComponentType<{ readonly notification: NotificationRecord }>> = {
  "incident.opened": IncidentNotification,
  "incident.closed": IncidentNotification,
  "wrapped.report": WrappedReportNotification,
  "custom.message": CustomMessageNotification,
}

export function NotificationItem({ notification }: { readonly notification: NotificationRecord }) {
  const Renderer = RENDERERS[notification.kind]
  if (!Renderer) {
    return null
  }
  return <Renderer notification={notification} />
}
