import type { NotificationKind } from "@domain/notifications"
import type { ComponentType } from "react"
import type { NotificationRecord } from "../../../../domains/notifications/notifications.functions.ts"
import { BillingLimitReachedNotification } from "./renderers/billing-limit-reached-notification.tsx"
import { CustomMessageNotification } from "./renderers/custom-message-notification.tsx"
import { DestinationQuarantinedNotification } from "./renderers/destination-quarantined-notification.tsx"
import { IncidentNotification } from "./renderers/incident/index.tsx"
import { SignalAssignedNotification } from "./renderers/signal-assigned-notification.tsx"
import { SignalDiscoveredNotification } from "./renderers/signal-discovered-notification.tsx"
import { SignalRegressedNotification } from "./renderers/signal-regressed-notification.tsx"
import { WrappedReportNotification } from "./renderers/wrapped-report-notification.tsx"

const RENDERERS: Record<NotificationKind, ComponentType<{ readonly notification: NotificationRecord }>> = {
  "incident.event": IncidentNotification,
  "incident.opened": IncidentNotification,
  "incident.closed": IncidentNotification,
  "wrapped.report": WrappedReportNotification,
  "custom.message": CustomMessageNotification,
  "issue.assigned": SignalAssignedNotification,
  "signal.discovered": SignalDiscoveredNotification,
  "signal.regressed": SignalRegressedNotification,
  "destination.quarantined": DestinationQuarantinedNotification,
  "billing.limit-reached": BillingLimitReachedNotification,
}

export function NotificationItem({ notification }: { readonly notification: NotificationRecord }) {
  const Renderer = RENDERERS[notification.kind]
  if (!Renderer) {
    return null
  }
  return <Renderer notification={notification} />
}
