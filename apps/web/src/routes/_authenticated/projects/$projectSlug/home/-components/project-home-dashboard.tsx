import { isManualQueue, isSystemQueue } from "@domain/annotation-queues"
import { BarChart, Button, Icon, Skeleton, Text, useChartCssTheme } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight, BarChart3, CircleCheck, Layers } from "lucide-react"
import { useMemo } from "react"
import { listAnnotationQueuesByProject } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { useIssues } from "../../../../../../domains/issues/issues.collection.ts"
import type { IssueRecord } from "../../../../../../domains/issues/issues.functions.ts"
import { formatPercent } from "../../issues/-components/issue-formatters.ts"
import { IssueLifecycleStatuses } from "../../issues/-components/issue-lifecycle-statuses.tsx"
import { issueOccurrenceBarColorForCategory } from "../../issues/-components/issue-status-bar-chart-colors.ts"
import { HomeSectionTitle } from "./home-section-title.tsx"
import { buildHomeSevenDayWindow } from "./home-seven-day-window.ts"
import { ProjectHomeIssueTrendMiniChart } from "./project-home-issue-trend-mini-chart.tsx"
import { ProjectHomeSectionBlankSlate } from "./project-home-section-blank-slate.tsx"
import { ProjectHomeTracePanel } from "./project-home-trace-panel.tsx"

const NEEDS_ATTENTION_STATES = new Set(["new", "escalating", "regressed"])

function issueNeedsAttention(issue: IssueRecord): boolean {
  return issue.states.some((s) => NEEDS_ATTENTION_STATES.has(s))
}

function AnnotationQueueHomeMetric({
  label,
  value,
  isLoading,
  skeletonWidthClassName = "w-16",
}: {
  readonly label: string
  readonly value: string
  readonly isLoading?: boolean
  readonly skeletonWidthClassName?: string
}) {
  return (
    <div className="flex min-w-[120px] max-w-[200px] shrink-0 basis-[148px] flex-col gap-1.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {isLoading ? (
        <Skeleton className={`h-5 ${skeletonWidthClassName}`} />
      ) : (
        <Text.H5 color="foreground" className="tabular-nums">
          {value}
        </Text.H5>
      )}
    </div>
  )
}

export function ProjectHomeDashboard({
  projectId,
  projectSlug,
}: {
  readonly projectId: string
  readonly projectSlug: string
}) {
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000))
  const { currentRange, compareFilters, issuesTimeRange } = useMemo(
    () => buildHomeSevenDayWindow(Date.now()),
    [hourBucket],
  )

  const {
    data: issueRows,
    analytics,
    isLoading: issuesLoading,
  } = useIssues({
    projectId,
    lifecycleGroup: "active",
    sorting: { column: "occurrences", direction: "desc" },
    timeRange: issuesTimeRange,
    limit: 50,
  })

  const needsAttentionRows = useMemo(() => issueRows.filter(issueNeedsAttention).slice(0, 5), [issueRows])

  const chartTheme = useChartCssTheme()
  const issuesByStatusData = useMemo(() => {
    const rows = [
      { category: "New", value: analytics.counts.newIssues },
      { category: "Escalating", value: analytics.counts.escalatingIssues },
      { category: "Regressed", value: analytics.counts.regressedIssues },
      { category: "Resolved", value: analytics.counts.resolvedIssues },
    ]
    return rows
      .filter((item) => item.value > 0)
      .map((item) => ({
        ...item,
        barColor: issueOccurrenceBarColorForCategory(item.category, chartTheme),
      }))
  }, [analytics.counts, chartTheme])

  const { data: queuesResponse, isLoading: queuesLoading } = useQuery({
    queryKey: ["project-home-queues", projectId],
    queryFn: () =>
      listAnnotationQueuesByProject({
        data: { projectId, limit: 100, sortBy: "pendingItems", sortDirection: "desc" },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })

  const manualQueues = useMemo(() => {
    const all = queuesResponse?.queues ?? []
    return all.filter((q) => !isSystemQueue(q) && isManualQueue(q.settings))
  }, [queuesResponse?.queues])

  const topQueues = useMemo(() => manualQueues.slice(0, 6), [manualQueues])

  const manualQueueRollup = useMemo(() => {
    let pending = 0
    let completed = 0
    let total = 0
    for (const q of manualQueues) {
      pending += Math.max(0, q.totalItems - q.completedItems)
      completed += q.completedItems
      total += q.totalItems
    }
    return {
      pending,
      completed,
      total,
      queueCount: manualQueues.length,
      doneRatio: total > 0 ? completed / total : 0,
    }
  }, [manualQueues])

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex flex-col gap-2.5">
        <HomeSectionTitle label="Traces" />
        <ProjectHomeTracePanel
          projectId={projectId}
          projectSlug={projectSlug}
          currentRange={currentRange}
          compareFilters={compareFilters}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <HomeSectionTitle label="Issues" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-3">
            <div className="flex min-w-0 flex-row items-start justify-between gap-2">
              <Text.H6 color="foregroundMuted" className="min-w-0 truncate">
                By status
              </Text.H6>
              <Button variant="outline" size="sm" className="shrink-0" asChild>
                <Link to="/projects/$projectSlug/issues" params={{ projectSlug }}>
                  View issues
                </Link>
              </Button>
            </div>
            {issuesLoading ? (
              <Skeleton className="h-[176px] w-full" />
            ) : issuesByStatusData.length === 0 ? (
              <ProjectHomeSectionBlankSlate
                icon={BarChart3}
                title="No issues in the last 7 days"
                description="Lifecycle counts will appear here when issues are detected in this window."
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/projects/$projectSlug/issues" params={{ projectSlug }}>
                      View issues
                    </Link>
                  </Button>
                }
              />
            ) : (
              <BarChart
                data={issuesByStatusData}
                height={160}
                showYAxis={false}
                ariaLabel="Issues by status"
                formatTooltip={(category, value) => `${category}<br/><b>${formatCount(value)}</b> issues`}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-3">
            <Text.H6 color="foregroundMuted" className="min-w-0 truncate">
              Needs attention
            </Text.H6>
            {issuesLoading && needsAttentionRows.length === 0 ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : needsAttentionRows.length === 0 ? (
              <ProjectHomeSectionBlankSlate
                icon={CircleCheck}
                title="Nothing needs attention"
                description="No new, escalating, or regressing issues in the last 7 days."
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/projects/$projectSlug/issues" params={{ projectSlug }}>
                      View issues
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col">
                {needsAttentionRows.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex flex-row items-center gap-2 border-b border-border/60 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0 max-w-[220px] shrink-0">
                      <IssueLifecycleStatuses states={issue.states} wrap={false} />
                    </div>
                    <Link
                      to="/projects/$projectSlug/issues"
                      params={{ projectSlug }}
                      search={{ issueId: issue.id }}
                      className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:underline"
                    >
                      {issue.name}
                    </Link>
                    <ProjectHomeIssueTrendMiniChart issue={issue} />
                    <Text.H6 color="foregroundMuted" className="shrink-0 whitespace-nowrap tabular-nums">
                      {formatCount(issue.occurrences)} occ · {formatPercent(issue.affectedTracesPercent)} traces
                    </Text.H6>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <HomeSectionTitle label="Annotation queues" />
        <div className="flex flex-col gap-3 rounded-lg bg-secondary p-2">
          <div className="flex min-w-0 flex-row flex-wrap items-start justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-row flex-wrap gap-3">
              <AnnotationQueueHomeMetric
                label="Pending"
                value={formatCount(manualQueueRollup.pending)}
                isLoading={queuesLoading}
                skeletonWidthClassName="w-14"
              />
              <AnnotationQueueHomeMetric
                label="Completed"
                value={formatCount(manualQueueRollup.completed)}
                isLoading={queuesLoading}
                skeletonWidthClassName="w-14"
              />
              <AnnotationQueueHomeMetric
                label="Progress"
                value={formatPercent(manualQueueRollup.doneRatio)}
                isLoading={queuesLoading}
                skeletonWidthClassName="w-12"
              />
              <AnnotationQueueHomeMetric
                label="Queues"
                value={formatCount(manualQueueRollup.queueCount)}
                isLoading={queuesLoading}
                skeletonWidthClassName="w-10"
              />
            </div>
            <Button variant="outline" size="sm" className="shrink-0 self-start" asChild>
              <Link to="/projects/$projectSlug/annotation-queues/" params={{ projectSlug }}>
                View queues
              </Link>
            </Button>
          </div>
          {queuesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : topQueues.length === 0 ? (
            <ProjectHomeSectionBlankSlate
              icon={Layers}
              title="No manual queues yet"
              description="Create a manual review queue to track annotation work for this project."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/projects/$projectSlug/annotation-queues/" params={{ projectSlug }}>
                    View queues
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {topQueues.map((q) => {
                const completed = q.completedItems
                const pending = Math.max(0, q.totalItems - q.completedItems)
                const total = q.totalItems
                const doneRatioPct = total > 0 ? Math.round((completed / total) * 100) : 0
                return (
                  <div key={q.id} className="flex min-w-0 flex-row flex-nowrap items-center gap-2 py-2 sm:gap-3">
                    <Text.H5 color="foreground" className="min-w-0 flex-1 truncate font-medium">
                      {q.name}
                    </Text.H5>
                    <Text.H6 color="foregroundMuted" className="shrink-0 tabular-nums">
                      {formatCount(completed)}
                    </Text.H6>
                    <div className="h-2 w-[96px] shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${doneRatioPct}%` }}
                      />
                    </div>
                    <Text.H6 color="foregroundMuted" className="shrink-0 tabular-nums">
                      {formatCount(pending)}
                    </Text.H6>
                    <Button variant="secondary-soft" size="sm" className="w-fit shrink-0 gap-1 px-2.5" asChild>
                      <Link
                        to="/projects/$projectSlug/annotation-queues/$queueId"
                        params={{ projectSlug, queueId: q.id }}
                        search={{ focus: true }}
                      >
                        Focus
                        <Icon icon={ArrowUpRight} size="sm" />
                      </Link>
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
