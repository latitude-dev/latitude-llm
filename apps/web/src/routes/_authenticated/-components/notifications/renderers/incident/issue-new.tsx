import type { IncidentNotificationPayload } from "@domain/notifications"
import { ShieldAlertIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../../base-notification.tsx"
import { buildIssueUrl, useLiveIssueSummary } from "./-incident-helpers.ts"
import { IssueSummaryCard } from "./issue-summary-card.tsx"

export function IssueNewNotification({
  notification,
  payload,
}: {
  readonly notification: NotificationRecord
  readonly payload: IncidentNotificationPayload
}) {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const live = useLiveIssueSummary(payload)
  const issueName = live?.name ?? payload.issueName
  // Snapshot status for issue.new is always "new"; the live lookup may
  // upgrade this if the issue moved on (resolved, escalated, etc.).
  const states = live?.states ?? ["new"]
  const url = buildIssueUrl(payload)

  return (
    <BaseNotification seenAt={seenAt} icon={<ShieldAlertIcon />} title="A new issue has been detected." url={url}>
      {issueName ? <IssueSummaryCard name={issueName} states={states} /> : null}
    </BaseNotification>
  )
}
