import { isManualQueue, isSystemQueue } from "@domain/annotation-queues"
import { Button, Icon, Skeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Activity, ArrowUpRight, ChartColumn, ClipboardList } from "lucide-react"
import { useMemo } from "react"
import { listAnnotationQueuesByProject } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { useIssues } from "../../../../../../domains/issues/issues.collection.ts"
import type { IssueRecord } from "../../../../../../domains/issues/issues.functions.ts"
import { formatPercent } from "../../issues/-components/issue-formatters.ts"
import { IssueLifecycleStatuses } from "../../issues/-components/issue-lifecycle-statuses.tsx"
import { IssuesAnalyticsPanel } from "../../issues/-components/issues-analytics-panel.tsx"
import { HomeSectionTitle } from "./home-section-title.tsx"
import { buildHomeSevenDayWindow } from "./home-seven-day-window.ts"
import { ProjectHomeTracePanel } from "./project-home-trace-panel.tsx"

const NEEDS_ATTENTION_STATES = new Set(["new", "escalating", "regressed"])

function issueNeedsAttention(issue: IssueRecord): boolean {
  return issue.states.some((s) => NEEDS_ATTENTION_STATES.has(s))
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <HomeSectionTitle icon={<Activity />} label="Traces" />
        <ProjectHomeTracePanel projectId={projectId} currentRange={currentRange} compareFilters={compareFilters} />
      </div>

      <div className="flex flex-col gap-2.5">
        <HomeSectionTitle icon={<ChartColumn />} label="Issues" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-3">
            <div className="flex min-w-0 flex-row items-center justify-between gap-2">
              <Text.H5M color="foreground" className="min-w-0 truncate">
                Issue occurrences
              </Text.H5M>
              <Button variant="outline" size="sm" className="shrink-0 gap-1" asChild>
                <Link to="/projects/$projectSlug/issues" params={{ projectSlug }}>
                  View issues
                  <Icon icon={ArrowUpRight} size="sm" />
                </Link>
              </Button>
            </div>
            <IssuesAnalyticsPanel
              analytics={analytics}
              isLoading={issuesLoading}
              showMetricsRow={false}
              withPanelChrome={false}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-3">
            <Text.H5M color="foreground" className="min-w-0 truncate">
              Needs attention
            </Text.H5M>
            {issuesLoading && needsAttentionRows.length === 0 ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : needsAttentionRows.length === 0 ? (
              <Text.H6 color="foregroundMuted">Nothing needs attention in the last 7 days.</Text.H6>
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
        <HomeSectionTitle icon={<ClipboardList />} label="Annotation queues" />
        <div className="flex flex-col gap-3 rounded-lg bg-secondary p-3">
          <Text.H5M color="foreground" className="min-w-0 truncate">
            Pending review
          </Text.H5M>
          {queuesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : topQueues.length === 0 ? (
            <Text.H6 color="foregroundMuted">No manual queues yet</Text.H6>
          ) : (
            <div className="flex flex-col gap-3">
              {topQueues.map((q) => {
                const completed = q.completedItems
                const pending = Math.max(0, q.totalItems - q.completedItems)
                const total = q.totalItems
                const doneRatioPct = total > 0 ? Math.round((completed / total) * 100) : 0
                return (
                  <div key={q.id} className="flex min-w-0 flex-row flex-nowrap items-center gap-2 sm:gap-3">
                    <Text.H6 color="foreground" className="min-w-0 flex-1 truncate font-medium">
                      {q.name}
                    </Text.H6>
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
