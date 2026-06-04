import type { IncidentClosedPayload, IncidentEventPayload, IncidentOpenedPayload } from "@domain/notifications"
import { Text } from "@repo/ui"
import { SearchAlertIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../../base-notification.tsx"
import { useLiveSavedSearchName, useMonitorUrl } from "./-incident-helpers.ts"
import type { IncidentEvent } from "./index.tsx"
import { MonitorAttribution } from "./monitor-attribution.tsx"

const TITLE: Record<IncidentEvent, string> = {
  event: "A search alert fired.",
  opened: "A search alert is escalating.",
  closed: "A search alert stopped escalating.",
}

/**
 * Renders `savedSearch.*` incident notifications. The descriptive content is the
 * source saved search's name (live-resolved) plus the monitor attribution + condition.
 */
export function SavedSearchIncidentNotification({
  notification,
  payload,
  event,
}: {
  readonly notification: NotificationRecord
  readonly payload: IncidentEventPayload | IncidentOpenedPayload | IncidentClosedPayload
  readonly event: IncidentEvent
}) {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const url = useMonitorUrl({ projectId: notification.projectId, monitorSlug: payload.monitorSlug })
  const savedSearchName = useLiveSavedSearchName({ projectId: notification.projectId, savedSearchId: payload.sourceId })

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<SearchAlertIcon />}
      title={TITLE[event]}
      url={url}
    >
      {savedSearchName ? <Text.H5M color="foregroundMuted">{savedSearchName}</Text.H5M> : null}
      <MonitorAttribution payload={payload} />
    </BaseNotification>
  )
}
