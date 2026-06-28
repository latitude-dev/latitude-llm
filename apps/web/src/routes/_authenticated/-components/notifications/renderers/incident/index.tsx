import {
  type IncidentClosedPayload,
  type IncidentEventPayload,
  type IncidentOpenedPayload,
  incidentClosedPayloadSchema,
  incidentEventPayloadSchema,
  incidentOpenedPayloadSchema,
  type NotificationKind,
} from "@domain/notifications"
import { Text } from "@repo/ui"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../../base-notification.tsx"
import { SavedSearchIncidentNotification } from "./saved-search.tsx"
import { SignalEscalatingNotification } from "./signal-escalating.tsx"

/**
 * Notification kinds map to lifecycle events:
 * - `incident.event`  → one-shot monitor breaches
 * - `incident.opened` → sustained signal or monitor starts
 * - `incident.closed` → sustained signal or monitor closes
 */
export type IncidentEvent = "event" | "opened" | "closed"

export type IncidentRendererProps<E extends IncidentEvent> = E extends "event"
  ? { readonly notification: NotificationRecord; readonly payload: IncidentEventPayload; readonly event: "event" }
  : E extends "opened"
    ? { readonly notification: NotificationRecord; readonly payload: IncidentOpenedPayload; readonly event: "opened" }
    : { readonly notification: NotificationRecord; readonly payload: IncidentClosedPayload; readonly event: "closed" }

const Unsupported = ({ notification }: { readonly notification: NotificationRecord }) => {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  return (
    <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
      <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
    </BaseNotification>
  )
}

const renderEvent = (notification: NotificationRecord, payload: IncidentEventPayload) => {
  switch (payload.incidentKind) {
    case "monitor.match":
    case "monitor.threshold":
      return <SavedSearchIncidentNotification notification={notification} payload={payload} event="event" />
    case "signal.escalating":
    case "monitor.escalating":
      // Sustained kinds shouldn't land as incident.event; defensive fallback.
      return <Unsupported notification={notification} />
  }
}

const renderOpened = (notification: NotificationRecord, payload: IncidentOpenedPayload) => {
  if (payload.incidentKind === "signal.escalating") {
    return <SignalEscalatingNotification notification={notification} payload={payload} event="opened" />
  }
  // savedSearch.threshold in `multiplier`/`expected` mode is sustained (opens with `endedAt = null`),
  // so it lands here alongside savedSearch.escalating. (`absolute` mode is one-shot → incident.event.)
  if (payload.incidentKind === "monitor.escalating" || payload.incidentKind === "monitor.threshold") {
    return <SavedSearchIncidentNotification notification={notification} payload={payload} event="opened" />
  }
  // Eventful kinds shouldn't land as opened; defensive fallback.
  return <Unsupported notification={notification} />
}

const renderClosed = (notification: NotificationRecord, payload: IncidentClosedPayload) => {
  if (payload.incidentKind === "signal.escalating") {
    return <SignalEscalatingNotification notification={notification} payload={payload} event="closed" />
  }
  // savedSearch.threshold in `multiplier`/`expected` mode is sustained, so its close lands here too.
  if (payload.incidentKind === "monitor.escalating" || payload.incidentKind === "monitor.threshold") {
    return <SavedSearchIncidentNotification notification={notification} payload={payload} event="closed" />
  }
  // Eventful kinds shouldn't land as closed; defensive fallback.
  return <Unsupported notification={notification} />
}

export function IncidentNotification({ notification }: { readonly notification: NotificationRecord }) {
  const kind: NotificationKind = notification.kind
  if (kind === "incident.event") {
    const parsed = incidentEventPayloadSchema.safeParse(notification.payload)
    return parsed.success ? renderEvent(notification, parsed.data) : <Unsupported notification={notification} />
  }
  if (kind === "incident.opened") {
    const parsed = incidentOpenedPayloadSchema.safeParse(notification.payload)
    return parsed.success ? renderOpened(notification, parsed.data) : <Unsupported notification={notification} />
  }
  if (kind === "incident.closed") {
    const parsed = incidentClosedPayloadSchema.safeParse(notification.payload)
    return parsed.success ? renderClosed(notification, parsed.data) : <Unsupported notification={notification} />
  }
  return <Unsupported notification={notification} />
}
