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
import { IssueEscalatingNotification } from "./issue-escalating.tsx"
import { IssueNewNotification } from "./issue-new.tsx"
import { IssueRegressedNotification } from "./issue-regressed.tsx"
import { SavedSearchIncidentNotification } from "./saved-search.tsx"

/**
 * Notification kinds map to lifecycle events:
 * - `incident.event`  → one-shot (issue.new, issue.regressed, savedSearch.match, and savedSearch.threshold in `absolute` mode — a point-in-time breach)
 * - `incident.opened` → sustained start (issue.escalating, savedSearch.escalating, and savedSearch.threshold in `multiplier`/`expected` mode — these open with `endedAt = null` and close later)
 * - `incident.closed` → sustained close (issue.escalating, savedSearch.escalating, savedSearch.threshold multiplier/expected)
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
    case "issue.new":
      return <IssueNewNotification notification={notification} payload={payload} event="event" />
    case "issue.regressed":
      return <IssueRegressedNotification notification={notification} payload={payload} event="event" />
    case "savedSearch.match":
    case "savedSearch.threshold":
      return <SavedSearchIncidentNotification notification={notification} payload={payload} event="event" />
    case "issue.escalating":
    case "savedSearch.escalating":
      // Sustained kinds shouldn't land as incident.event; defensive fallback.
      return <Unsupported notification={notification} />
  }
}

const renderOpened = (notification: NotificationRecord, payload: IncidentOpenedPayload) => {
  if (payload.incidentKind === "issue.escalating") {
    return <IssueEscalatingNotification notification={notification} payload={payload} event="opened" />
  }
  // savedSearch.threshold in `multiplier`/`expected` mode is sustained (opens with `endedAt = null`),
  // so it lands here alongside savedSearch.escalating. (`absolute` mode is one-shot → incident.event.)
  if (payload.incidentKind === "savedSearch.escalating" || payload.incidentKind === "savedSearch.threshold") {
    return <SavedSearchIncidentNotification notification={notification} payload={payload} event="opened" />
  }
  // Eventful kinds shouldn't land as opened; defensive fallback.
  return <Unsupported notification={notification} />
}

const renderClosed = (notification: NotificationRecord, payload: IncidentClosedPayload) => {
  if (payload.incidentKind === "issue.escalating") {
    return <IssueEscalatingNotification notification={notification} payload={payload} event="closed" />
  }
  // savedSearch.threshold in `multiplier`/`expected` mode is sustained, so its close lands here too.
  if (payload.incidentKind === "savedSearch.escalating" || payload.incidentKind === "savedSearch.threshold") {
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
