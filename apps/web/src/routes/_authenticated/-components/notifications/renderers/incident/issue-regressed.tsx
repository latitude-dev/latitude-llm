import type { IncidentNotificationPayload } from "@domain/notifications"
import { ShieldAlertIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../../base-notification.tsx"
import { buildIssueUrl, useIncidentLinkFallback, useLiveIssueSummary } from "./-incident-helpers.ts"
import { IssueSummaryCard } from "./issue-summary-card.tsx"

export function IssueRegressedNotification({
  notification,
  payload,
}: {
  readonly notification: NotificationRecord
  readonly payload: IncidentNotificationPayload
}) {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const fallback = useIncidentLinkFallback(payload, notification.sourceId)
  const live = useLiveIssueSummary(payload, fallback)
  const issueName = live?.name ?? payload.issueName ?? fallback?.issueName ?? undefined
  // Snapshot status for issue.regressed is "regressed". If the user has
  // already re-resolved the issue by the time they read the notification,
  // the live lookup will upgrade the badge to "resolved".
  const states = live?.states ?? ["regressed"]
  const url = buildIssueUrl(payload, fallback)

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      icon={<ShieldAlertIcon />}
      title="A resolved issue has regressed."
      url={url}
    >
      {issueName ? <IssueSummaryCard name={issueName} states={states} /> : null}
    </BaseNotification>
  )
}
