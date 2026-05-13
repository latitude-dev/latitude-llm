import type { IncidentNotificationPayload } from "@domain/notifications"
import { Icon } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../../domains/notifications/notifications.functions.ts"
import { getIncidentTrend } from "../../../../../../domains/notifications/notifications.functions.ts"
import { IssueTrendBar } from "../../../../projects/$projectSlug/issues/-components/issue-trend-bar.tsx"
import { BaseNotification } from "../../base-notification.tsx"
import { buildIssueUrl, useLiveIssueSummary } from "./-incident-helpers.ts"
import { IssueSummaryCard } from "./issue-summary-card.tsx"

export function IssueEscalatingNotification({
  notification,
  payload,
}: {
  readonly notification: NotificationRecord
  readonly payload: IncidentNotificationPayload
}) {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const live = useLiveIssueSummary(payload)
  const issueName = live?.name ?? payload.issueName
  const opened = payload.event === "opened"
  // Snapshot status for opened is "escalating"; for closed we genuinely
  // don't know (the escalation just ended — the issue could be ongoing,
  // resolved, or regressed). Wait for the live lookup in that case.
  const states = live?.states ?? (opened ? ["escalating"] : [])
  const url = buildIssueUrl(payload)

  const icon = opened ? TrendingUpIcon : TrendingDownIcon

  return (
    <BaseNotification
      seenAt={seenAt}
      icon={<Icon icon={icon} />}
      title={opened ? "An issue is escalating." : "An issue stopped escalating."}
      url={url}
    >
      {issueName ? <IssueSummaryCard name={issueName} states={states} /> : null}
      <EscalatingTrend notificationSourceId={notification.sourceId} event={payload.event} states={states} />
    </BaseNotification>
  )
}

/**
 * Mini trend chart scoped to ±1 day around the incident's start (for
 * `opened`) or end (for `closed`). Lazily fetched per-notification — the
 * card is already rendered by the time this query resolves so the layout
 * doesn't shift jarringly.
 */
function EscalatingTrend({
  notificationSourceId,
  event,
  states,
}: {
  readonly notificationSourceId: string | null
  readonly event: "opened" | "closed"
  readonly states: readonly string[]
}) {
  const enabled = notificationSourceId !== null
  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "incident-trend", notificationSourceId, event],
    queryFn: () =>
      getIncidentTrend({
        data: { alertIncidentId: notificationSourceId ?? "", event },
      }),
    enabled,
    staleTime: 30_000,
  })

  if (!enabled) return null

  // Use padding (internal spacing) rather than `mt-*` per the web-frontend
  // skill's "no margin utilities" rule. Parent (`BaseNotification`) renders
  // children in a flex column; this wrapper adds breathing room above the
  // chart without leaning on margins.
  return (
    <div className="pt-2">
      <IssueTrendBar
        buckets={data?.buckets ?? []}
        bucketSeconds={12 * 60 * 60}
        height={48}
        isLoading={isLoading}
        showLabels={false}
        states={states}
      />
    </div>
  )
}
