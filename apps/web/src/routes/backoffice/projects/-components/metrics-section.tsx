import { BarChart, type BarChartLineSeries, HistogramSkeleton, StackedAreaChart, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { type AdminProjectMetricsDto, adminGetProjectMetrics } from "../../../../domains/admin/projects.functions.ts"
import { DashboardSection, DashboardSplit } from "../../-components/dashboard/index.ts"
import { TopIssuesTable } from "./top-issues-table.tsx"

const CHART_HEIGHT = 200

// Stacked area layer colours. Hardcoded HSL strings rather than CSS
// variables because the chart-theme module only exposes a handful of
// tokens — exposing more is worth doing later, but for v1 these three
// values keep the layers visually distinct in both light and dark.
// Order is rendering order (the chart stacks bottom-up).
const ISSUE_LAYER_COLORS = {
  resolved: "hsl(142 60% 45%)",
  tracked: "hsl(217 91% 60%)",
  untracked: "hsl(25 90% 55%)",
} as const

const ANNOTATION_LINE_COLOR = "hsl(280 70% 60%)"

function formatBucketLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: "numeric", day: "numeric" })
}

function formatBucketTooltip(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

interface MetricsSectionProps {
  readonly projectId: string
}

export function MetricsSection({ projectId }: MetricsSectionProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["backoffice", "project-metrics", projectId],
    queryFn: () => adminGetProjectMetrics({ data: { projectId } }),
    staleTime: 60_000,
  })

  if (isError) {
    return (
      <DashboardSection title="Activity (last 30 days)">
        <div className="flex min-h-[120px] items-center justify-center">
          <Text.H6 color="destructive">Could not load metrics.</Text.H6>
        </div>
      </DashboardSection>
    )
  }

  if (isLoading || !data) {
    return (
      <>
        <DashboardSection title="Activity (last 30 days)">
          <HistogramSkeleton height={CHART_HEIGHT} />
        </DashboardSection>
        <DashboardSplit
          ratio="wide-primary"
          primary={
            <DashboardSection title="Top issues">
              <HistogramSkeleton height={CHART_HEIGHT} />
            </DashboardSection>
          }
          secondary={
            <DashboardSection title="Issues over time">
              <HistogramSkeleton height={CHART_HEIGHT} />
            </DashboardSection>
          }
        />
      </>
    )
  }

  return (
    <>
      <DashboardSection title="Activity (last 30 days)">
        <ActivityChart activity={data.activity} />
      </DashboardSection>
      <DashboardSplit
        ratio="wide-primary"
        primary={
          <DashboardSection title="Top issues" count={data.topIssues.length}>
            <TopIssuesTable issues={data.topIssues} />
          </DashboardSection>
        }
        secondary={
          <DashboardSection title="Issues over time">
            <IssuesLifecycleChart points={data.issuesLifecycle} />
          </DashboardSection>
        }
      />
    </>
  )
}

function ActivityChart({ activity }: { readonly activity: AdminProjectMetricsDto["activity"] }) {
  const chartData = useMemo(
    () =>
      activity.map((p) => ({
        category: formatBucketLabel(p.bucketStart),
        tooltipCategory: formatBucketTooltip(p.bucketStart),
        value: p.traceCount,
      })),
    [activity],
  )

  const lines = useMemo<BarChartLineSeries[]>(
    () => [
      {
        name: "Manual annotations",
        values: activity.map((p) => p.annotationCount),
        color: ANNOTATION_LINE_COLOR,
        axis: "right",
      },
    ],
    [activity],
  )

  const formatTooltip = useMemo(
    () =>
      (category: string, value: number): string => {
        return `${category}<br/><b>${formatCount(value)}</b> traces`
      },
    [],
  )

  if (activity.every((p) => p.traceCount === 0 && p.annotationCount === 0)) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <Text.H6 color="foregroundMuted">No activity in this window.</Text.H6>
      </div>
    )
  }

  return (
    <BarChart
      data={chartData}
      lines={lines}
      primarySeriesName="Traces"
      secondaryAxisName="Annotations"
      height={CHART_HEIGHT}
      formatTooltip={formatTooltip}
      ariaLabel="Project activity over the last 30 days"
    />
  )
}

function IssuesLifecycleChart({ points }: { readonly points: AdminProjectMetricsDto["issuesLifecycle"] }) {
  const categories = useMemo(() => points.map((p) => formatBucketLabel(p.bucketStart)), [points])

  const series = useMemo(
    () => [
      // Bottom-first stacking order: resolved baseline at the bottom,
      // active layers on top so day-to-day movement is most visible at
      // the top edge of the band.
      { name: "Resolved", values: points.map((p) => p.resolved), color: ISSUE_LAYER_COLORS.resolved },
      { name: "Tracked", values: points.map((p) => p.tracked), color: ISSUE_LAYER_COLORS.tracked },
      { name: "Untracked", values: points.map((p) => p.untracked), color: ISSUE_LAYER_COLORS.untracked },
    ],
    [points],
  )

  const tooltipTitle = useMemo(
    () =>
      (_label: string, dataIndex: number): string => {
        const point = points[dataIndex]
        return point ? formatBucketTooltip(point.bucketStart) : ""
      },
    [points],
  )

  if (points.every((p) => p.untracked === 0 && p.tracked === 0 && p.resolved === 0)) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <Text.H6 color="foregroundMuted">No issues yet.</Text.H6>
      </div>
    )
  }

  return (
    <StackedAreaChart
      categories={categories}
      series={series}
      height={CHART_HEIGHT}
      tooltipTitle={tooltipTitle}
      ariaLabel="Issues lifecycle over the last 30 days"
    />
  )
}
