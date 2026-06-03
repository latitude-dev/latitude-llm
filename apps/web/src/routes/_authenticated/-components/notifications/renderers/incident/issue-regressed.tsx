import { ShieldAlertIcon } from "lucide-react"
import { BaseNotification } from "../../base-notification.tsx"
import { useIssueUrl, useLiveIssueSummary } from "./-incident-helpers.ts"
import type { IncidentRendererProps } from "./index.tsx"
import { IssueSummaryCard } from "./issue-summary-card.tsx"
import { MonitorAttribution } from "./monitor-attribution.tsx"

export function IssueRegressedNotification({ notification, payload }: IncidentRendererProps<"event">) {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const target = { projectId: notification.projectId, sourceId: payload.sourceId }
  const live = useLiveIssueSummary(target)
  // Snapshot status for issue.regressed is "regressed". If the user has
  // already re-resolved the issue by the time they read the notification,
  // the live lookup will upgrade the badge to "resolved".
  const states = live?.states ?? ["regressed"]
  const url = useIssueUrl(target)

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<ShieldAlertIcon />}
      title="A resolved issue has regressed."
      url={url}
    >
      {live?.name ? <IssueSummaryCard name={live.name} states={states} /> : null}
      <MonitorAttribution payload={payload} />
    </BaseNotification>
  )
}
