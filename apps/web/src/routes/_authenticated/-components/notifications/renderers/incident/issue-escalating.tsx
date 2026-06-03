import { Icon } from "@repo/ui"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { IssueTrendBar } from "../../../../projects/$projectSlug/issues/-components/issue-trend-bar.tsx"
import { BaseNotification } from "../../base-notification.tsx"
import { useIssueUrl, useLiveIssueSummary } from "./-incident-helpers.ts"
import type { IncidentRendererProps } from "./index.tsx"
import { IssueSummaryCard } from "./issue-summary-card.tsx"
import { MonitorAttribution } from "./monitor-attribution.tsx"

type EscalatingTrend = IncidentRendererProps<"opened" | "closed">["payload"]["trend"]

export function IssueEscalatingNotification({
  notification,
  payload,
  event,
}: IncidentRendererProps<"opened" | "closed">) {
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const target = { projectId: notification.projectId, sourceId: payload.sourceId }
  const live = useLiveIssueSummary(target)
  const opened = event === "opened"
  // Snapshot status for opened is "escalating"; for closed we genuinely
  // don't know (the escalation just ended — the issue could be ongoing,
  // resolved, or regressed). Wait for the live lookup in that case.
  const states = live?.states ?? (opened ? ["escalating"] : [])
  const url = useIssueUrl(target)
  const icon = opened ? TrendingUpIcon : TrendingDownIcon

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<Icon icon={icon} />}
      title={opened ? "An issue is escalating." : "An issue stopped escalating."}
      url={url}
    >
      {live?.name ? <IssueSummaryCard name={live.name} states={states} /> : null}
      <EscalatingTrend trend={payload.trend} states={states} />
      <MonitorAttribution payload={payload} />
    </BaseNotification>
  )
}

/**
 * Per-bucket trend rendered from the notification payload snapshot. No
 * live query — the producer captures the 3h window ending at the
 * incident transition, so the bell and the email render from one
 * source of truth.
 */
function EscalatingTrend({ trend, states }: { readonly trend: EscalatingTrend; readonly states: readonly string[] }) {
  const buckets = trend.points.map((point) => ({ bucket: point.t, count: point.count }))
  const escalationThresholds = trend.points
    .filter((point): point is typeof point & { threshold: number } => point.threshold !== null)
    .map((point) => ({ bucket: point.t, thresholdCount: point.threshold }))

  // Use padding (internal spacing) rather than `mt-*` per the web-frontend
  // skill's "no margin utilities" rule. Parent (`BaseNotification`) renders
  // children in a flex column; this wrapper adds breathing room above the
  // chart without leaning on margins.
  return (
    <div className="pt-2">
      <IssueTrendBar
        buckets={buckets}
        escalationThresholds={escalationThresholds}
        bucketSeconds={trend.bucketDurationMs / 1000}
        height={48}
        showLabels={false}
        states={states}
      />
    </div>
  )
}
