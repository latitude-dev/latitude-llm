import type { ComponentType } from "react"
import type { NotificationRecord } from "../../../../domains/notifications/notifications.functions.ts"
import { CustomMessageNotification } from "./renderers/custom-message-notification.tsx"
import { IncidentNotification } from "./renderers/incident/index.tsx"
import { WrappedReportNotification } from "./renderers/wrapped-report-notification.tsx"

const RENDERERS: Record<NotificationRecord["type"], ComponentType<{ readonly notification: NotificationRecord }>> = {
  incident: IncidentNotification,
  custom_message: CustomMessageNotification,
  wrapped_report: WrappedReportNotification,
}

export function NotificationItem({ notification }: { readonly notification: NotificationRecord }) {
  const Renderer = RENDERERS[notification.type]
  if (!Renderer) {
    return null
  }
  return <Renderer notification={notification} />
}
