import { ShieldAlertIcon } from "lucide-react"
import { BaseNotification } from "../../base-notification.tsx"
import { buildIssueUrl, useIncidentLinkFallback, useLiveIssueSummary } from "./-incident-helpers.ts"
import type { IncidentRendererProps } from "./index.tsx"
import { IssueSummaryCard } from "./issue-summary-card.tsx"

export function IssueNewNotification({ notification, payload }: IncidentRendererProps) {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const fallback = useIncidentLinkFallback(payload, payload.alertIncidentId ?? null)
  const live = useLiveIssueSummary(payload, fallback)
  const issueName = live?.name ?? payload.issueName ?? fallback?.issueName ?? undefined
  // Snapshot status for issue.new is always "new"; the live lookup may
  // upgrade this if the issue moved on (resolved, escalated, etc.).
  const states = live?.states ?? ["new"]
  const url = buildIssueUrl(payload, fallback)

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
      {issueName ? <IssueSummaryCard name={issueName} states={states} /> : null}
    </BaseNotification>
  )
}
