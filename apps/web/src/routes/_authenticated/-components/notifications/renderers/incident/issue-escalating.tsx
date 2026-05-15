import { Icon } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { getIncidentTrend } from "../../../../../../domains/notifications/notifications.functions.ts"
import { IssueTrendBar } from "../../../../projects/$projectSlug/issues/-components/issue-trend-bar.tsx"
import { BaseNotification } from "../../base-notification.tsx"
import { buildIssueUrl, useIncidentLinkFallback, useLiveIssueSummary } from "./-incident-helpers.ts"
import type { IncidentEvent, IncidentRendererProps } from "./index.tsx"
import { IssueSummaryCard } from "./issue-summary-card.tsx"

export function IssueEscalatingNotification({ notification, payload, event }: IncidentRendererProps) {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const fallback = useIncidentLinkFallback(payload, payload.alertIncidentId ?? null)
  const live = useLiveIssueSummary(payload, fallback)
  const issueName = live?.name ?? payload.issueName ?? fallback?.issueName ?? undefined
  const opened = event === "opened"
  // Snapshot status for opened is "escalating"; for closed we genuinely
  // don't know (the escalation just ended — the issue could be ongoing,
  // resolved, or regressed). Wait for the live lookup in that case.
  const states = live?.states ?? (opened ? ["escalating"] : [])
  const url = buildIssueUrl(payload, fallback)

  const icon = opened ? TrendingUpIcon : TrendingDownIcon

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      icon={<Icon icon={icon} />}
      title={opened ? "An issue is escalating." : "An issue stopped escalating."}
      url={url}
    >
      {issueName ? <IssueSummaryCard name={issueName} states={states} /> : null}
      <EscalatingTrend alertIncidentId={payload.alertIncidentId ?? null} event={event} states={states} />
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
  alertIncidentId,
  event,
  states,
}: {
  readonly alertIncidentId: string | null
  readonly event: IncidentEvent
  readonly states: readonly string[]
}) {
  const enabled = alertIncidentId !== null
  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "incident-trend", alertIncidentId, event],
    queryFn: () =>
      getIncidentTrend({
        data: { alertIncidentId: alertIncidentId ?? "", event },
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
