import { ShieldAlertIcon } from "lucide-react"
import { BaseNotification } from "../../base-notification.tsx"
import { useIssueUrl, useLiveIssueSummary } from "./-incident-helpers.ts"
import type { IncidentRendererProps } from "./index.tsx"
import { IssueSummaryCard } from "./issue-summary-card.tsx"
import { MonitorAttribution } from "./monitor-attribution.tsx"

export function IssueNewNotification({ notification, payload }: IncidentRendererProps<"event">) {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const target = { projectId: notification.projectId, sourceId: payload.sourceId }
  const live = useLiveIssueSummary(target)
  // Snapshot status for issue.new is always "new"; the live lookup may
  // upgrade this if the issue has moved on (resolved, escalated, etc.).
  const states = live?.states ?? ["new"]
  const url = useIssueUrl(target)

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<ShieldAlertIcon />}
      title="A new issue has been detected."
      url={url}
    >
      {live?.name ? <IssueSummaryCard name={live.name} states={states} /> : null}
      <MonitorAttribution payload={payload} />
    </BaseNotification>
  )
}
